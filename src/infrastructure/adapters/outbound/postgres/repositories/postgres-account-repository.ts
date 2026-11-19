import { sql, type Kysely } from 'kysely';
import type {
  AccountContext,
  AccountRepository,
  RecordMetadata,
} from '../../../../../application/ports/outbound/account-repository';
import {
  IdempotencyKeyReusedError,
  UserNotFoundError,
} from '../../../../../application/shared/errors';
import type { RecordedOrder } from '../../../../../application/shared/idempotency';
import { stateFrom } from '../../../../../domain/account/decider';
import type { Decision } from '../../../../../domain/account/decision';
import type { DB } from '../../../../database/schema';
import { selectAccountOrders, selectOrderRows, toAccountEvents } from '../account-orders';
import { toEventRecord } from '../mappers/account-event';
import { toOrderView } from '../mappers/order';

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly db: Kysely<DB>) {}

  withAccount(
    userId: number,
    decide: (account: AccountContext) => Decision,
    metadata: RecordMetadata,
  ): Promise<RecordedOrder> {
    return this.db.transaction().execute(async (trx) => {
      // 1. Bloquea la cuenta.
      const { rows: lock } = await sql<{ locked: boolean }>`
        SELECT lock_account(${userId}) AS locked
      `.execute(trx);
      if (!lock[0]?.locked) throw new UserNotFoundError(userId);

      // 2. Si es un reintento, devuelve la orden original. Se revisa con la
      //    cuenta bloqueada, así dos reintentos simultáneos no crean dos órdenes
      //    (ADR-0003, punto 3).
      const { idempotency } = metadata;
      if (idempotency) {
        const original = await selectOrderRows(trx, userId)
          .select('o.requesthash')
          .where('o.idempotencykey', '=', idempotency.key)
          .executeTakeFirst();
        if (original) {
          if (original.requesthash !== idempotency.requestHash) {
            throw new IdempotencyKeyReusedError(idempotency.key);
          }
          return { order: toOrderView(original), replayed: true };
        }
      }

      // 3. Arma el estado con la cuenta ya bloqueada.
      const rows = await selectAccountOrders(trx, userId).execute();
      const state = stateFrom(toAccountEvents(rows));

      // 4. Reserva el número de la orden, así la orden y su evento comparten el id.
      const { rows: next } = await sql<{ id: string }>`
        SELECT nextval('orders_id_seq') AS id
      `.execute(trx);
      const nextOrderId = Number(next[0]!.id);

      // 5. Decide.
      const { event, order } = decide({ state, nextOrderId });
      if (order.orderId !== nextOrderId) {
        throw new Error(`La orden decidida (${order.orderId}) no usa el número reservado (${nextOrderId})`);
      }

      // 6. Guarda la orden, con su clave también si se rechazó, y su evento.
      await trx
        .insertInto('orders')
        .values({
          id: order.orderId,
          userid: userId,
          instrumentid: order.instrumentId,
          side: order.side,
          type: order.type,
          size: order.size?.toString() ?? null,
          price: order.price?.toString() ?? null,
          status: order.status,
          rejectreason: order.rejectReason,
          datetime: metadata.occurredAt,
          idempotencykey: idempotency?.key ?? null,
          requesthash: idempotency?.requestHash ?? null,
        })
        .execute();

      const { last } = await trx
        .selectFrom('account_events')
        .select((eb) => eb.fn.max('sequence').as('last'))
        .where('account_id', '=', userId)
        .executeTakeFirstOrThrow();

      const record = toEventRecord(event);
      await trx
        .insertInto('account_events')
        .values({
          account_id: userId,
          sequence: (last ?? 0) + 1,
          event_type: record.eventType,
          event_version: record.eventVersion,
          order_id: record.orderId,
          payload: JSON.stringify(record.payload),
          metadata: JSON.stringify({ source: 'api', correlationId: metadata.correlationId }),
          occurred_at: metadata.occurredAt,
        })
        .execute();

      return {
        order: {
          id: order.orderId,
          userId,
          instrumentId: order.instrumentId,
          side: order.side,
          type: order.type,
          size: order.size,
          price: order.price,
          status: order.status,
          rejectReason: order.rejectReason,
          datetime: metadata.occurredAt,
        },
        replayed: false,
      };
    });
  }
}
