import type { AccountEvent } from '../../../../../domain/account/events';
import type { OrderDetails, OrderSnapshot } from '../../../../../domain/order/order';
import { Money } from '../../../../../domain/shared/money';
import { toOrderSnapshot } from './order';

const EVENT_VERSION = 1;

export interface EventRecord {
  eventType: AccountEvent['type'];
  eventVersion: number;
  orderId: number;
  payload: Record<string, unknown>;
}

function orderPayload(order: Pick<OrderDetails, 'orderId' | 'instrumentId' | 'side' | 'type'> & {
  size: { toString(): string } | null;
  price: { toString(): string } | null;
}) {
  return {
    orderId: order.orderId,
    instrumentId: order.instrumentId,
    side: order.side,
    type: order.type,
    size: order.size?.toString() ?? null,
    price: order.price?.toString() ?? null,
  };
}

export function toEventRecord(event: AccountEvent): EventRecord {
  const record = (orderId: number, payload: Record<string, unknown>): EventRecord => ({
    eventType: event.type,
    eventVersion: EVENT_VERSION,
    orderId,
    payload,
  });

  const requested = (amount: { toString(): string } | undefined) =>
    amount ? { requestedAmount: amount.toString() } : {};

  switch (event.type) {
    case 'OrderAccepted':
    case 'OrderFilled':
      return record(event.order.orderId, {
        ...orderPayload(event.order),
        ...requested(event.requestedAmount),
      });
    case 'OrderRejected':
      return record(event.order.orderId, {
        ...orderPayload(event.order),
        reason: event.reason,
        ...requested(event.requestedAmount),
      });
    case 'OrderCancelled':
      return record(event.orderId, { orderId: event.orderId });
    case 'CashTransferredIn':
    case 'CashTransferredOut':
      return record(event.orderId, { orderId: event.orderId, amount: event.amount.toString() });
    case 'LegacyOrderImported':
      throw new Error('Los eventos legacy solo los escribe el backfill');
  }
}

export interface EventRow {
  account_id: number;
  sequence: number;
  event_type: string;
  event_version: number;
  payload: unknown;
  occurred_at: Date;
  instrument_type: string | null;
}

function field(payload: Record<string, unknown>, key: string, row: EventRow): unknown {
  if (!(key in payload)) {
    throw new Error(`El evento ${row.sequence} de la cuenta ${row.account_id} no tiene ${key}`);
  }
  return payload[key];
}

function text(payload: Record<string, unknown>, key: string, row: EventRow): string | null {
  const value = field(payload, key, row);
  if (value !== null && typeof value !== 'string') {
    throw new Error(`El evento ${row.sequence} de la cuenta ${row.account_id} tiene un ${key} inválido`);
  }
  return value;
}

function integer(payload: Record<string, unknown>, key: string, row: EventRow): number {
  const value = field(payload, key, row);
  if (!Number.isInteger(value)) {
    throw new Error(`El evento ${row.sequence} de la cuenta ${row.account_id} tiene un ${key} inválido`);
  }
  return value as number;
}

/**
 * La orden del payload, con las mismas validaciones que una fila de `orders`.
 * El estado y el motivo de rechazo los da el tipo de evento, salvo en los
 * legacy, que los traen en el payload.
 */
function orderFrom(
  payload: Record<string, unknown>,
  row: EventRow,
  status: string | null,
  rejectReason: string | null,
): OrderSnapshot {
  return toOrderSnapshot({
    id: integer(payload, 'orderId', row),
    userid: row.account_id,
    instrumentid: integer(payload, 'instrumentId', row),
    side: text(payload, 'side', row) ?? '',
    type: text(payload, 'type', row) ?? '',
    size: text(payload, 'size', row),
    price: text(payload, 'price', row),
    status: status ?? '',
    rejectreason: rejectReason,
    datetime: row.occurred_at,
    instrument_type: row.instrument_type,
  });
}

function details({ orderId, instrumentId, side, type, size, price }: OrderSnapshot): OrderDetails {
  if (!size || !price) throw new Error(`La orden ${orderId} no tiene cantidad o precio`);
  return { orderId, instrumentId, side, type, size, price };
}

function requestedAmount(payload: Record<string, unknown>): { requestedAmount?: Money } {
  const amount = payload['requestedAmount'];
  return typeof amount === 'string' ? { requestedAmount: Money.of(amount) } : {};
}

/**
 * Fila de `account_events` → evento de dominio. Es la inversa de
 * `toEventRecord`, más los `LegacyOrderImported` que escribe el backfill.
 * Falla ante una versión o un payload que no reconoce, en lugar de ignorarlo.
 */
export function fromEventRecord(row: EventRow): AccountEvent {
  if (row.event_version !== EVENT_VERSION) {
    throw new Error(`El evento ${row.sequence} de la cuenta ${row.account_id} tiene la versión ${row.event_version}`);
  }
  if (typeof row.payload !== 'object' || row.payload === null) {
    throw new Error(`El evento ${row.sequence} de la cuenta ${row.account_id} no tiene payload`);
  }
  const payload = row.payload as Record<string, unknown>;
  const cash = () => Money.of(text(payload, 'amount', row) ?? '');

  switch (row.event_type as AccountEvent['type']) {
    case 'OrderAccepted':
      return {
        type: 'OrderAccepted',
        order: details(orderFrom(payload, row, 'NEW', null)),
        ...requestedAmount(payload),
      };
    case 'OrderFilled':
      return {
        type: 'OrderFilled',
        order: details(orderFrom(payload, row, 'FILLED', null)),
        ...requestedAmount(payload),
      };
    case 'OrderRejected': {
      const { orderId, instrumentId, side, type, size, price, rejectReason } = orderFrom(
        payload,
        row,
        'REJECTED',
        text(payload, 'reason', row),
      );
      return {
        type: 'OrderRejected',
        order: { orderId, instrumentId, side, type, size, price },
        reason: rejectReason!,
        ...requestedAmount(payload),
      };
    }
    case 'OrderCancelled':
      return { type: 'OrderCancelled', orderId: integer(payload, 'orderId', row) };
    case 'CashTransferredIn':
      return { type: 'CashTransferredIn', orderId: integer(payload, 'orderId', row), amount: cash() };
    case 'CashTransferredOut':
      return { type: 'CashTransferredOut', orderId: integer(payload, 'orderId', row), amount: cash() };
    case 'LegacyOrderImported':
      return {
        type: 'LegacyOrderImported',
        order: orderFrom(payload, row, text(payload, 'status', row), text(payload, 'rejectReason', row)),
      };
    default:
      throw new Error(`El evento ${row.sequence} de la cuenta ${row.account_id} es de un tipo desconocido: ${row.event_type}`);
  }
}
