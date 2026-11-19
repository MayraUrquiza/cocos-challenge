import { decide } from '../../../domain/account/decider';
import { InvalidTransitionError } from '../../../domain/order/state-machine';
import type { FillOrder, FillOrderCommand } from '../../ports/inbound/fill-order';
import type { AccountRepository } from '../../ports/outbound/account-repository';
import type { Clock } from '../../ports/outbound/clock';
import type { OrderFinder } from '../../ports/outbound/order-finder';
import { OrderNotFoundError, OrderNotPendingError } from '../../shared/errors';
import type { OrderView } from '../../shared/order-view';

export class FillOrderHandler implements FillOrder {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly ordersFinder: OrderFinder,
    private readonly clock: Clock,
  ) {}

  async execute(command: FillOrderCommand): Promise<OrderView> {
    const userId = await this.ordersFinder.findOwnerId(command.orderId);
    if (userId === null) throw new OrderNotFoundError(command.orderId);

    const { order } = await this.accounts.withAccount(
      userId,
      ({ state }) => {
        try {
          return decide(state, { type: 'FillOrder', orderId: command.orderId });
        } catch (error) {
          if (error instanceof InvalidTransitionError) throw new OrderNotPendingError(command.orderId);
          throw error;
        }
      },
      { occurredAt: this.clock.now(), correlationId: command.correlationId, idempotency: null },
    );
    return order;
  }
}
