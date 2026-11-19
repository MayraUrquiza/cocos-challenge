import { projectPortfolio } from '../../../domain/portfolio/project-portfolio';
import type { GetPortfolio, UserPortfolio } from '../../ports/inbound/get-portfolio';
import type { PortfolioFinder } from '../../ports/outbound/portfolio-finder';
import type { PriceProvider } from '../../ports/outbound/price-provider';
import { UserNotFoundError } from '../../shared/errors';

export class GetPortfolioHandler implements GetPortfolio {
  constructor(
    private readonly portfolioFinder: PortfolioFinder,
    private readonly priceProvider: PriceProvider,
  ) {}

  async execute({ userId }: { userId: number }): Promise<UserPortfolio> {
    const account = await this.portfolioFinder.findAccount(userId);
    if (!account) throw new UserNotFoundError(userId);

    const stockIds = account.instruments
      .filter((instrument) => instrument.type === 'ACCIONES')
      .map((instrument) => instrument.id);
    const prices = await this.priceProvider.latestPrices(stockIds);

    const portfolio = projectPortfolio({
      events: account.events,
      instruments: new Map(account.instruments.map((instrument) => [instrument.id, instrument])),
      prices,
    });

    return { userId: account.userId, accountNumber: account.accountNumber, ...portfolio };
  }
}
