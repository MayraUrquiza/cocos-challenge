import type { OrderView } from '../../shared/order-view';
import type { Page, PageRequest } from '../../shared/pagination';

export interface ListOrdersQuery extends PageRequest {
  userId: number;
}

export interface ListOrders {
  execute(query: ListOrdersQuery): Promise<Page<OrderView>>;
}
