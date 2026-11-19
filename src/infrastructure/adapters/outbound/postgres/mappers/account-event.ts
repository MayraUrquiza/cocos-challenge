import type { AccountEvent } from '../../../../../domain/account/events';
import type { OrderDetails } from '../../../../../domain/order/order';

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

  switch (event.type) {
    case 'OrderAccepted':
    case 'OrderFilled':
      return record(event.order.orderId, orderPayload(event.order));
    case 'OrderRejected':
      return record(event.order.orderId, { ...orderPayload(event.order), reason: event.reason });
    case 'OrderCancelled':
      return record(event.orderId, { orderId: event.orderId });
    case 'CashTransferredIn':
    case 'CashTransferredOut':
      return record(event.orderId, { orderId: event.orderId, amount: event.amount.toString() });
    case 'LegacyOrderImported':
      throw new Error('Los eventos legacy solo los escribe el backfill');
  }
}
