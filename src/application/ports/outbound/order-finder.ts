import type { OrderView } from '../../shared/order-view';
import type { PageRequest } from '../../shared/pagination';

export interface OrderFinder {
  findById(query: { userId: number; orderId: number }): Promise<OrderView | null>;
  listByUser(
    query: { userId: number } & PageRequest,
  ): Promise<{ items: OrderView[]; total: number }>;
}
