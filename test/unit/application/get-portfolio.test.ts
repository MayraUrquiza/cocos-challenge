import type {
  PortfolioAccount,
  PortfolioFinder,
} from '../../../src/application/ports/outbound/portfolio-finder';
import type { PriceProvider } from '../../../src/application/ports/outbound/price-provider';
import { UserNotFoundError } from '../../../src/application/shared/errors';
import { GetPortfolioHandler } from '../../../src/application/use-cases/queries/get-portfolio';
import { seedEvents, seedInstruments, seedPrices } from '../../support/seed-account';

const account: PortfolioAccount = {
  userId: 1,
  accountNumber: '10001',
  events: seedEvents,
  instruments: [...seedInstruments.values()],
};

function finder(found: PortfolioAccount | null): PortfolioFinder {
  return { findAccount: async () => found };
}

function prices() {
  const latestPrices = jest.fn<ReturnType<PriceProvider['latestPrices']>, Parameters<PriceProvider['latestPrices']>>(
    async () => seedPrices,
  );
  return { latestPrices };
}

describe('GetPortfolioHandler', () => {
  it('arma el portfolio del usuario con su número de cuenta', async () => {
    const portfolio = await new GetPortfolioHandler(finder(account), prices()).execute({ userId: 1 });

    expect(portfolio.userId).toBe(1);
    expect(portfolio.accountNumber).toBe('10001');
    expect(portfolio.totalValue.toString()).toBe('889756.00');
    expect(portfolio.cash.available.toString()).toBe('627500.00');
  });

  it('pide precios solo de las acciones, no de los pesos', async () => {
    const priceProvider = prices();
    await new GetPortfolioHandler(finder(account), priceProvider).execute({ userId: 1 });

    const requested = priceProvider.latestPrices.mock.calls[0]![0];
    expect([...requested].sort()).toEqual([31, 45, 47, 54]);
  });

  it('un usuario inexistente es USER_NOT_FOUND', async () => {
    await expect(
      new GetPortfolioHandler(finder(null), prices()).execute({ userId: 999 }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
