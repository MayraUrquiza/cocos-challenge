import { sql, type Kysely } from 'kysely';
import type {
  AccountContext,
  AccountRepository,
  RecordMetadata,
} from '../../../../../application/ports/outbound/account-repository';
import { UserNotFoundError } from '../../../../../application/shared/errors';
import type { OrderView } from '../../../../../application/shared/order-view';
import { stateFrom } from '../../../../../domain/account/decider';
import type { Decision } from '../../../../../domain/account/decision';
import type { DB } from '../../../../database/schema';
import { selectAccountOrders, toAccountEvents } from '../account-orders';
import { toEventRecord } from '../mappers/account-event';

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly db: Kysely<DB>) {}

  withAccount(
    userId: number,
    decide: (account: AccountContext) => Decision,
    metadata: RecordMetadata,
  ): Promise<OrderView> {
    return this.db.transaction().execute(async (trx) => {
      // 1. Bloquea la cuenta.
      const { rows: lock } = await sql<{ locked: boolean }>`
        SELECT lock_account(${userId}) AS locked
      `.execute(trx);
      if (!lock[0]?.locked) throw new UserNotFoundError(userId);

      // 2. Arma el estado con la cuenta ya bloqueada.
      const rows = await selectAccountOrders(trx, userId).execute();
      const state = stateFrom(toAccountEvents(rows));

      // 3. Reserva el número de la orden, así la orden y su evento comparten el id.
      const { rows: next } = await sql<{ id: string }>`
        SELECT nextval('orders_id_seq') AS id
      `.execute(trx);
      const nextOrderId = Number(next[0]!.id);

      // 4. Decide.
      const { event, order } = decide({ state, nextOrderId });
      if (order.orderId !== nextOrderId) {
        throw new Error(`La orden decidida (${order.orderId}) no usa el número reservado (${nextOrderId})`);
      }

      // 5. Guarda la orden y su evento.
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
      };
    });
  }
}
