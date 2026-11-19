import type { Kysely } from 'kysely';
import { GetPortfolioHandler } from '../../src/application/use-cases/queries/get-portfolio';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresPortfolioFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-portfolio-finder';
import { PostgresPriceProvider } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-price-provider';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

describe('GET /v1/users/{userId}/portfolio', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let app: App;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({
        getPortfolio: new GetPortfolioHandler(new PostgresPortfolioFinder(db), new PostgresPriceProvider(db)),
      }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await testDb?.drop();
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

  it('un usuario inexistente responde 404 USER_NOT_FOUND', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/users/999/portfolio' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});
