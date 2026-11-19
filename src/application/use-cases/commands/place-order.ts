import { decide } from '../../../domain/account/decider';
import type { PlaceOrder, PlaceOrderCommand } from '../../ports/inbound/place-order';
import type { AccountRepository } from '../../ports/outbound/account-repository';
import type { Clock } from '../../ports/outbound/clock';
import type { InstrumentFinder } from '../../ports/outbound/instrument-finder';
import type { PriceProvider } from '../../ports/outbound/price-provider';
import { InstrumentNotFoundError, InstrumentNotTradableError } from '../../shared/errors';
import type { RecordedOrder } from '../../shared/idempotency';

export class PlaceOrderHandler implements PlaceOrder {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly instrumentsFinder: InstrumentFinder,
    private readonly priceProvider: PriceProvider,
    private readonly clock: Clock,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<RecordedOrder> {
    const instrument = await this.instrumentsFinder.findById(command.instrumentId);
    if (!instrument) throw new InstrumentNotFoundError(command.instrumentId);
    if (instrument.type === 'MONEDA') throw new InstrumentNotTradableError(instrument.ticker);

    const marketPrice =
      command.type === 'MARKET'
        ? ((await this.priceProvider.latestPrices([instrument.id])).get(instrument.id)?.close ?? null)
        : null;

    return this.accounts.withAccount(
      command.userId,
      ({ state, nextOrderId }) =>
        decide(state, {
          type: 'PlaceOrder',
          orderId: nextOrderId,
          instrumentId: instrument.id,
          side: command.side,
          orderType: command.type,
          quantity: command.quantity,
          marketPrice,
          limitPrice: command.type === 'LIMIT' ? command.price : null,
        }),
      {
        occurredAt: this.clock.now(),
        correlationId: command.correlationId,
        idempotency: command.idempotency,
      },
    );
  }
}
