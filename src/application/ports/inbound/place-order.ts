import type { Money } from '../../../domain/shared/money';
import type { OrderType } from '../../../domain/shared/order-values';
import type { Quantity } from '../../../domain/shared/quantity';
import type { OrderView } from '../../shared/order-view';

export interface PlaceOrderCommand {
  userId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  type: OrderType;
  quantity: { size: Quantity } | { amount: Money };
  price: Money | null;
  correlationId: string | null;
}

export interface PlaceOrder {
  execute(command: PlaceOrderCommand): Promise<OrderView>;
}
