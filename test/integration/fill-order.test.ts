import type { Kysely } from 'kysely';
import { FillOrderHandler } from '../../src/application/use-cases/commands/fill-order';
import { GetPortfolioHandler } from '../../src/application/use-cases/queries/get-portfolio';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresOrderFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-order-finder';
import { PostgresPortfolioFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-portfolio-finder';
import { PostgresPriceProvider } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-price-provider';
import { PostgresAccountRepository } from '../../src/infrastructure/adapters/outbound/postgres/repositories/postgres-account-repository';
import { SystemClock } from '../../src/infrastructure/adapters/outbound/system/system-clock';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

describe('POST /v1/simulation/orders/{orderId}/fill', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
  });

  afterAll(async () => {
    await db?.destroy();
    await testDb?.drop();
  });

  const appWith = (marketSimulationEnabled: boolean) =>
    buildApp(
      {
        checkDatabase: async () => {},
        useCases: stubUseCases({
          fillOrder: new FillOrderHandler(
            new PostgresAccountRepository(db),
            new PostgresOrderFinder(db),
            new SystemClock(),
          ),
          getPortfolio: new GetPortfolioHandler(new PostgresPortfolioFinder(db), new PostgresPriceProvider(db)),
        }),
      },
      { marketSimulationEnabled },
    );

  it('con la simulación apagada, la ruta no existe', async () => {
    const app = await appWith(false);
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/simulation/orders/7/fill' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await app.close();
    }
  });

  describe('con la simulación encendida', () => {
    let app: App;

    beforeAll(async () => {
      app = await appWith(true);
    });

    afterAll(async () => {
      await app?.close();
    });

    const fill = (orderId: number) =>
      app.inject({ method: 'POST', url: `/v1/simulation/orders/${orderId}/fill` });

    it('ejecutar una compra LIMIT convierte su reserva en gasto real y suma la tenencia', async () => {
      // Orden 7: compra LIMIT de 60 BMA a 1.500, aparta 90.000. El usuario 1 tiene −10 BMA.
      const response = await fill(7);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: 7, status: 'FILLED', size: '60', price: '1500.00' });

      const portfolio = (await app.inject({ method: 'GET', url: '/v1/users/1/portfolio' })).json();
      // Los reservados y los pesos bajan 90.000, lo disponible no cambia.
      expect(portfolio.cash).toEqual({ total: '663000.00', reserved: '35500.00', available: '627500.00' });
      // −10 + 60 = 50, con un costo promedio nuevo al precio de la compra (ADR-0004, punto 2).
      expect(portfolio.positions.find((position: { ticker: string }) => position.ticker === 'BMA')).toMatchObject({
        quantity: '50',
        avgCostPrice: '1500.00',
        warnings: [],
      });
    });

    it('una orden que no está pendiente responde 409, y una inexistente 404', async () => {
      const again = await fill(7);
      const missing = await fill(9999);

      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'ORDER_NOT_PENDING' });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });
  });
});
