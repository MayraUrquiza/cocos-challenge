import type { Kysely } from 'kysely';
import { GetPortfolioHandler } from '../../src/application/use-cases/queries/get-portfolio';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresPortfolioFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-portfolio-finder';
import { PostgresPriceProvider } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-price-provider';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

describe('portfolio contra PostgreSQL', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let portfolioFinder: PostgresPortfolioFinder;
  let priceProvider: PostgresPriceProvider;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    portfolioFinder = new PostgresPortfolioFinder(db);
    priceProvider = new PostgresPriceProvider(db);
  });

  afterAll(async () => {
    await db?.destroy();
    await testDb?.drop();
  });

  describe('PostgresPortfolioFinder', () => {
    it('traduce las órdenes ejecutadas y pendientes a eventos, en el orden en que ocurrieron', async () => {
      const account = await portfolioFinder.findAccount(1);

      expect(account?.accountNumber).toBe('10001');
      expect(
        account?.events.map((event) =>
          'order' in event ? `${event.type}:${event.order.orderId}` : `${event.type}:${event.orderId}`,
        ),
      ).toEqual([
        'CashTransferredIn:1',
        'OrderFilled:2',
        'OrderFilled:4',
        'OrderAccepted:5',
        'OrderAccepted:7',
        'CashTransferredOut:8',
        'OrderFilled:9',
        'OrderFilled:10',
        'OrderFilled:11',
      ]);
      expect(account?.instruments.map((instrument) => instrument.ticker).sort()).toEqual([
        'ARS',
        'BMA',
        'LOMA',
        'METR',
        'PAMP',
      ]);
    });

    it('un usuario sin órdenes existe, con listas vacías', async () => {
      await expect(portfolioFinder.findAccount(2)).resolves.toMatchObject({
        userId: 2,
        events: [],
        instruments: [],
      });
    });

    it('un usuario inexistente es null', async () => {
      await expect(portfolioFinder.findAccount(999)).resolves.toBeNull();
    });
  });

  describe('PostgresPriceProvider', () => {
    it('trae el último cierre y el anterior de cada instrumento', async () => {
      const prices = await priceProvider.latestPrices([47, 31]);

      expect(prices.get(47)?.close.toString()).toBe('925.85');
      expect(prices.get(47)?.previousClose?.toString()).toBe('921.80');
      expect(prices.get(31)?.close.toString()).toBe('1502.80');
    });

    it('un instrumento sin precios no aparece', async () => {
      const prices = await priceProvider.latestPrices([3]);
      expect(prices.has(3)).toBe(false);
    });

    it('sin instrumentos no consulta y devuelve un mapa vacío', async () => {
      await expect(priceProvider.latestPrices([])).resolves.toEqual(new Map());
    });
  });

  describe('GET /v1/users/{userId}/portfolio de punta a punta', () => {
    let app: App;

    beforeAll(async () => {
      app = await buildApp({
        checkDatabase: async () => {},
        useCases: stubUseCases({
          getPortfolio: new GetPortfolioHandler(portfolioFinder, priceProvider),
        }),
      });
    });

    afterAll(async () => {
      await app?.close();
    });

    it('el usuario 1 da exactamente el ejemplo del RFC', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/users/1/portfolio' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        userId: 1,
        accountNumber: '10001',
        totalValue: '889756.00',
        cash: { total: '753000.00', reserved: '125500.00', available: '627500.00' },
        warnings: ['NEGATIVE_QUANTITY'],
        positions: [
          {
            instrumentId: 31,
            ticker: 'BMA',
            name: 'Banco Macro S.A.',
            quantity: '-10',
            avgCostPrice: null,
            lastPrice: '1502.80',
            marketValue: '-15028.00',
            gain: null,
            returnPct: null,
            dailyReturnPct: '-1.15',
            warnings: ['NEGATIVE_QUANTITY'],
          },
          {
            instrumentId: 54,
            ticker: 'METR',
            name: 'MetroGAS S.A.',
            quantity: '500',
            avgCostPrice: '250.00',
            lastPrice: '229.50',
            marketValue: '114750.00',
            gain: '-10250.00',
            returnPct: '-8.20',
            dailyReturnPct: '-1.08',
            warnings: [],
          },
          {
            instrumentId: 47,
            ticker: 'PAMP',
            name: 'Pampa Holding S.A.',
            quantity: '40',
            avgCostPrice: '930.00',
            lastPrice: '925.85',
            marketValue: '37034.00',
            gain: '-166.00',
            returnPct: '-0.45',
            dailyReturnPct: '0.44',
            warnings: [],
          },
        ],
      });
    });

    it('un usuario sin órdenes tiene todo en cero', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/users/2/portfolio' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        userId: 2,
        totalValue: '0.00',
        cash: { total: '0.00', reserved: '0.00', available: '0.00' },
        warnings: [],
        positions: [],
      });
    });

    it('un usuario inexistente responde 404 USER_NOT_FOUND', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/users/999/portfolio' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'USER_NOT_FOUND' });
    });
  });
});
