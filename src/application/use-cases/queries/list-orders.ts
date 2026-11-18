import type { ListOrders, ListOrdersQuery } from '../../ports/inbound/list-orders';
import type { OrderFinder } from '../../ports/outbound/order-finder';
import type { UserFinder } from '../../ports/outbound/user-finder';
import { UserNotFoundError } from '../../shared/errors';
import type { OrderView } from '../../shared/order-view';
import type { Page } from '../../shared/pagination';

export class ListOrdersHandler implements ListOrders {
  constructor(
    private readonly usersFinder: UserFinder,
    private readonly ordersFinder: OrderFinder,
  ) {}

  async execute(query: ListOrdersQuery): Promise<Page<OrderView>> {
    const [userExists, { items, total }] = await Promise.all([
      this.usersFinder.exists(query.userId),
      this.ordersFinder.listByUser(query),
    ]);
    if (!userExists) throw new UserNotFoundError(query.userId);

    return { items, total, limit: query.limit, offset: query.offset };
  }
}
