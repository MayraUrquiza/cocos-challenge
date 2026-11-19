import { sql, type Kysely, type Transaction } from 'kysely';
import type {
  AccountContext,
  AccountRepository,
  RecordMetadata,
} from '../../../../../application/ports/outbound/account-repository';
import {
  IdempotencyKeyReusedError,
  UserNotFoundError,
} from '../../../../../application/shared/errors';
import type { IdempotencyKey, RecordedOrder } from '../../../../../application/shared/idempotency';
import type { OrderView } from '../../../../../application/shared/order-view';
import type { AccountState } from '../../../../../domain/account/account-state';
import { stateFrom } from '../../../../../domain/account/decider';
import type { Decision } from '../../../../../domain/account/decision';
import type { AccountEvent } from '../../../../../domain/account/events';
import type { OrderSnapshot } from '../../../../../domain/order/order';
import type { DB } from '../../../../database/schema';
import { selectAccountOrders, selectOrderRows, toAccountEvents } from '../account-orders';
import { toEventRecord } from '../mappers/account-event';
import { toOrderView } from '../mappers/order';

type Tx = Transaction<DB>;

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly db: Kysely<DB>) {}

  withAccount(
    userId: number,
    decide: (account: AccountContext) => Decision,
    metadata: RecordMetadata,
  ): Promise<RecordedOrder> {
    return this.db.transaction().execute(async (trx) => {
      await this.lockAccount(trx, userId);

      const replay = await this.findReplay(trx, userId, metadata.idempotency);
      if (replay) return { order: replay, replayed: true };

      const state = await this.loadState(trx, userId);
      const nextOrderId = await this.reserveOrderId(trx);
      const decision = decide({ state, nextOrderId });

      const orderId = await this.saveOrder(trx, userId, decision, nextOrderId, metadata);
      await this.appendEvent(trx, userId, decision.event, metadata);

      return { order: await this.readOrder(trx, userId, orderId), replayed: false };
    });
  }

  /**
   * Bloquea la cuenta hasta el fin de la transacción: los pedidos de la misma
   * cuenta esperan su turno, los de otras no. También valida que exista.
   */
  private async lockAccount(trx: Tx, userId: number): Promise<void> {
    const { rows } = await sql<{ locked: boolean }>`SELECT lock_account(${userId}) AS locked`.execute(trx);
    if (!rows[0]?.locked) throw new UserNotFoundError(userId);
  }

  /**
   * Si el pedido es un reintento, la orden original. Se revisa con la cuenta
   * bloqueada, así dos reintentos simultáneos no crean dos órdenes.
   */
  private async findReplay(
    trx: Tx,
    userId: number,
    idempotency: IdempotencyKey | null,
  ): Promise<OrderView | null> {
    if (!idempotency) return null;

    const original = await selectOrderRows(trx, userId)
      .select('o.requesthash')
      .where('o.idempotencykey', '=', idempotency.key)
      .executeTakeFirst();
    if (!original) return null;

    if (original.requesthash !== idempotency.requestHash) {
      throw new IdempotencyKeyReusedError(idempotency.key);
    }
    return toOrderView(original);
  }

  private async loadState(trx: Tx, userId: number): Promise<AccountState> {
    const rows = await selectAccountOrders(trx, userId).execute();
    return stateFrom(toAccountEvents(rows));
  }

  /** El número de la orden se reserva antes de decidir, así la orden y su evento comparten el id. */
  private async reserveOrderId(trx: Tx): Promise<number> {
    const { rows } = await sql<{ id: string }>`SELECT nextval('orders_id_seq') AS id`.execute(trx);
    return Number(rows[0]!.id);
  }

  /** Crea la orden o le cambia el estado, según la decisión. Devuelve su número. */
  private async saveOrder(
    trx: Tx,
    userId: number,
    decision: Decision,
    reservedId: number,
    metadata: RecordMetadata,
  ): Promise<number> {
    if (decision.kind === 'create') {
      await this.insertOrder(trx, userId, decision.order, reservedId, metadata);
      return decision.order.orderId;
    }
    await this.applyTransition(trx, userId, decision, metadata);
    return decision.orderId;
  }

  private async insertOrder(
    trx: Tx,
    userId: number,
    order: OrderSnapshot,
    reservedId: number,
    { occurredAt, idempotency }: RecordMetadata,
  ): Promise<void> {
    if (order.orderId !== reservedId) {
      throw new Error(`La orden decidida (${order.orderId}) no usa el número reservado (${reservedId})`);
    }
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
        datetime: occurredAt,
        idempotencykey: idempotency?.key ?? null,
        requesthash: idempotency?.requestHash ?? null,
      })
      .execute();
  }

  /**
   * Aplica la transición solo si la orden sigue en el estado esperado. La fecha
   * pasa a ser la del cambio: así el orden por fecha refleja cuándo se ejecutó
   * cada orden (ADR-0003, punto 6).
   */
  private async applyTransition(
    trx: Tx,
    userId: number,
    { orderId, from, to }: Extract<Decision, { kind: 'transition' }>,
    { occurredAt }: RecordMetadata,
  ): Promise<void> {
    const { numUpdatedRows } = await trx
      .updateTable('orders')
      .set({ status: to, datetime: occurredAt })
      .where('id', '=', orderId)
      .where('userid', '=', userId)
      .where('status', '=', from)
      .executeTakeFirstOrThrow();
    if (numUpdatedRows !== 1n) {
      throw new Error(`La orden ${orderId} ya no está en estado ${from}`);
    }
  }

  /** Agrega el evento al historial, en la posición siguiente de la cuenta. */
  private async appendEvent(
    trx: Tx,
    userId: number,
    event: AccountEvent,
    { occurredAt, correlationId }: RecordMetadata,
  ): Promise<void> {
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
        metadata: JSON.stringify({ source: 'api', correlationId }),
        occurred_at: occurredAt,
      })
      .execute();
  }

  private async readOrder(trx: Tx, userId: number, orderId: number): Promise<OrderView> {
    const row = await selectOrderRows(trx, userId).where('o.id', '=', orderId).executeTakeFirstOrThrow();
    return toOrderView(row);
  }
}
