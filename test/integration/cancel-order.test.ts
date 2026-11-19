import type { Kysely } from 'kysely';
import { CancelOrderHandler } from '../../src/application/use-cases/commands/cancel-order';
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

describe('POST /v1/users/{userId}/orders/{orderId}/cancel', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let migrator: Kysely<DB>;
  let app: App;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    migrator = createDatabase(testDb.migratorUrl);
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({
        cancelOrder: new CancelOrderHandler(
          new PostgresAccountRepository(db),
          new PostgresOrderFinder(db),
          new SystemClock(),
        ),
        getPortfolio: new GetPortfolioHandler(new PostgresPortfolioFinder(db), new PostgresPriceProvider(db)),
      }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await migrator?.destroy();
    await db?.destroy();
    await testDb?.drop();
  });

  const cancel = (userId: number, orderId: number) =>
    app.inject({ method: 'POST', url: `/v1/users/${userId}/orders/${orderId}/cancel` });

  const statusOf = async (orderId: number) =>
    (await migrator.selectFrom('orders').select('status').where('id', '=', orderId).executeTakeFirstOrThrow())
      .status;

  it('cancela una orden pendiente, libera lo que apartaba y lo registra en el historial', async () => {
    // Orden 5: compra LIMIT de 50 LOMA a 710, aparta 35.500.
    const response = await cancel(1, 5);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: 5, status: 'CANCELLED' });

    const portfolio = (await app.inject({ method: 'GET', url: '/v1/users/1/portfolio' })).json();
    expect(portfolio.cash).toEqual({ total: '753000.00', reserved: '90000.00', available: '663000.00' });

    const event = await migrator
      .selectFrom('account_events')
      .select(['event_type', 'payload'])
      .where('account_id', '=', 1)
      .orderBy('sequence', 'desc')
      .executeTakeFirstOrThrow();
    expect(event).toEqual({ event_type: 'OrderCancelled', payload: { orderId: 5 } });
  });

  it('una orden que ya no está pendiente responde 409 ORDER_NOT_PENDING', async () => {
    const again = await cancel(1, 5);
    const filled = await cancel(1, 2);

    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'ORDER_NOT_PENDING' });
    expect(filled.statusCode).toBe(409);
    expect(await statusOf(2)).toBe('FILLED');
  });

  it('cancelar una orden de otro usuario responde 404 y no la modifica', async () => {
    const response = await cancel(2, 7);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
    expect(await statusOf(7)).toBe('NEW');
  });
});
