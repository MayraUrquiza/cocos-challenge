import { decide } from '../../../domain/account/decider';
import { CASH_TICKER } from '../../../domain/shared/instrument';
import type { TransferCash, TransferCashCommand } from '../../ports/inbound/transfer-cash';
import type { AccountRepository } from '../../ports/outbound/account-repository';
import type { Clock } from '../../ports/outbound/clock';
import type { InstrumentFinder } from '../../ports/outbound/instrument-finder';
import type { OrderView } from '../../shared/order-view';

export class TransferCashHandler implements TransferCash {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly instrumentsFinder: InstrumentFinder,
    private readonly clock: Clock,
  ) {}

  async execute(command: TransferCashCommand): Promise<OrderView> {
    const cash = await this.instrumentsFinder.findByTicker(CASH_TICKER);
    if (!cash || cash.type !== 'MONEDA') {
      throw new Error(`No está cargado el instrumento de los pesos (${CASH_TICKER}, tipo MONEDA)`);
    }

    return this.accounts.withAccount(
      command.userId,
      ({ state, nextOrderId }) =>
        decide(state, {
          type: 'TransferCash',
          orderId: nextOrderId,
          side: command.type,
          amount: command.amount,
          cashInstrumentId: cash.id,
        }),
      { occurredAt: this.clock.now(), correlationId: command.correlationId },
    );
  }
}
