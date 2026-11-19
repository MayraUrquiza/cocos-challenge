import type { Money } from '../shared/money';
import type { OrderSide, OrderStatus, OrderType, RejectReason } from '../shared/order-values';
import type { Quantity } from '../shared/quantity';

export interface OrderDetails {
  orderId: number;
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: Quantity;
  price: Money;
}

/**
 * Una orden en su estado final, sin la historia de cómo llegó ahí. Es lo que
 * guarda la tabla `orders` y lo que trae un `LegacyOrderImported` (ADR-0003, punto 4).
 */
export interface OrderSnapshot {
  orderId: number;
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: Quantity | null;
  price: Money | null;
  status: OrderStatus;
  rejectReason: RejectReason | null;
}
