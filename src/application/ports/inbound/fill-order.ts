import type { OrderView } from '../../shared/order-view';

export interface FillOrderCommand {
  orderId: number;
  correlationId: string | null;
}

export interface FillOrder {
  execute(command: FillOrderCommand): Promise<OrderView>;
}
