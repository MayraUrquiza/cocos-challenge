import type { Money } from '../../domain/shared/money';
import type { OrderSide, OrderStatus, OrderType, RejectReason } from '../../domain/shared/order-values';
import type { Quantity } from '../../domain/shared/quantity';

export interface OrderView {
  id: number;
  userId: number;
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: Quantity | null;
  price: Money | null;
  status: OrderStatus;
  rejectReason: RejectReason | null;
  datetime: Date;
}
