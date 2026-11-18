import type { OrderView } from '../../shared/order-view';

export interface GetOrderQuery {
  userId: number;
  orderId: number;
}

export interface GetOrder {
  execute(query: GetOrderQuery): Promise<OrderView>;
}
