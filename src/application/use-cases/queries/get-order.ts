import type { GetOrder, GetOrderQuery } from '../../ports/inbound/get-order';
import type { OrderFinder } from '../../ports/outbound/order-finder';
import type { UserFinder } from '../../ports/outbound/user-finder';
import { OrderNotFoundError, UserNotFoundError } from '../../shared/errors';
import type { OrderView } from '../../shared/order-view';

export class GetOrderHandler implements GetOrder {
  constructor(
    private readonly usersFinder: UserFinder,
    private readonly ordersFinder: OrderFinder,
  ) {}

  async execute(query: GetOrderQuery): Promise<OrderView> {
    const order = await this.ordersFinder.findById(query);
    if (order) return order;

    if (!(await this.usersFinder.exists(query.userId))) {
      throw new UserNotFoundError(query.userId);
    }
    throw new OrderNotFoundError(query.orderId);
  }
}
