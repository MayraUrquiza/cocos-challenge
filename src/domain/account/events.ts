import type { OrderDetails, OrderSnapshot } from '../order/order';
import { Money } from '../shared/money';
import type { RejectReason } from '../shared/order-values';
import type { Quantity } from '../shared/quantity';

type RequestedAmount = { requestedAmount?: Money };

export type AccountEvent =
  | ({ type: 'OrderAccepted'; order: OrderDetails } & RequestedAmount)
  | ({ type: 'OrderFilled'; order: OrderDetails } & RequestedAmount)
  | ({
      type: 'OrderRejected';
      order: Omit<OrderDetails, 'size' | 'price'> & { size: Quantity | null; price: Money | null };
      reason: RejectReason;
    } & RequestedAmount)
  | { type: 'OrderCancelled'; orderId: number }
  | { type: 'CashTransferredIn'; orderId: number; amount: Money }
  | { type: 'CashTransferredOut'; orderId: number; amount: Money }
  | { type: 'LegacyOrderImported'; order: OrderSnapshot };

export type AccountEventType = AccountEvent['type'];

export function eventFromSnapshot(snapshot: OrderSnapshot): AccountEvent | null {
  if (snapshot.status !== 'FILLED' && snapshot.status !== 'NEW') return null;

  if (!snapshot.size || !snapshot.price) {
    throw new Error(`La orden ${snapshot.orderId} (${snapshot.status}) no tiene cantidad o precio`);
  }
  const order: OrderDetails = {
    orderId: snapshot.orderId,
    instrumentId: snapshot.instrumentId,
    side: snapshot.side,
    type: snapshot.type,
    size: snapshot.size,
    price: snapshot.price,
  };

  if (snapshot.status === 'NEW') return { type: 'OrderAccepted', order };

  switch (snapshot.side) {
    case 'CASH_IN':
      return { type: 'CashTransferredIn', orderId: snapshot.orderId, amount: Money.ofCash(order.size) };
    case 'CASH_OUT':
      return { type: 'CashTransferredOut', orderId: snapshot.orderId, amount: Money.ofCash(order.size) };
    case 'BUY':
    case 'SELL':
      return { type: 'OrderFilled', order };
  }
}
