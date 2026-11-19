import type { OrderView } from '../../shared/order-view';

export interface CancelOrderCommand {
  userId: number;
  orderId: number;
  correlationId: string | null;
}

export interface CancelOrder {
  execute(command: CancelOrderCommand): Promise<OrderView>;
}
