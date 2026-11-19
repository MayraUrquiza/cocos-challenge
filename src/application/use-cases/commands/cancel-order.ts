import { decide } from '../../../domain/account/decider';
import { InvalidTransitionError } from '../../../domain/order/state-machine';
import type { CancelOrder, CancelOrderCommand } from '../../ports/inbound/cancel-order';
import type { AccountRepository } from '../../ports/outbound/account-repository';
import type { Clock } from '../../ports/outbound/clock';
import type { OrderFinder } from '../../ports/outbound/order-finder';
import { OrderNotFoundError, OrderNotPendingError } from '../../shared/errors';
import type { OrderView } from '../../shared/order-view';

export class CancelOrderHandler implements CancelOrder {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly ordersFinder: OrderFinder,
    private readonly clock: Clock,
  ) {}

  async execute(command: CancelOrderCommand): Promise<OrderView> {
    const order = await this.ordersFinder.findById(command);
    if (!order) throw new OrderNotFoundError(command.orderId);

    const { order: cancelled } = await this.accounts.withAccount(
      command.userId,
      ({ state }) => {
        try {
          return decide(state, { type: 'CancelOrder', orderId: command.orderId });
        } catch (error) {
          if (error instanceof InvalidTransitionError) throw new OrderNotPendingError(command.orderId);
          throw error;
        }
      },
      { occurredAt: this.clock.now(), correlationId: command.correlationId, idempotency: null },
    );
    return cancelled;
  }
}
