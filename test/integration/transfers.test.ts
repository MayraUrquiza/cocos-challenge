import { sql, type Kysely } from 'kysely';
import { TransferCashHandler } from '../../src/application/use-cases/commands/transfer-cash';
import { GetPortfolioHandler } from '../../src/application/use-cases/queries/get-portfolio';
import { Money } from '../../src/domain/shared/money';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresInstrumentFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-instrument-finder';
import { PostgresPortfolioFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-portfolio-finder';
import { PostgresPriceProvider } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-price-provider';
import { PostgresAccountRepository } from '../../src/infrastructure/adapters/outbound/postgres/repositories/postgres-account-repository';
import { SystemClock } from '../../src/infrastructure/adapters/outbound/system/system-clock';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

describe('transferencias contra PostgreSQL', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let migrator: Kysely<DB>;
  let transferCash: TransferCashHandler;
  let app: App;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    migrator = createDatabase(testDb.migratorUrl);
    transferCash = new TransferCashHandler(
      new PostgresAccountRepository(db),
      new PostgresInstrumentFinder(db),
      new SystemClock(),
    );
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({
        transferCash,
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

  const transfer = (userId: number, type: 'CASH_IN' | 'CASH_OUT', amount: number) =>
    app.inject({
      method: 'POST',
      url: `/v1/users/${userId}/transfers`,
      headers: { 'x-correlation-id': `test-${userId}-${type}` },
      payload: { type, amount },
    });

  const eventsOf = (userId: number) =>
    migrator
      .selectFrom('account_events')
      .selectAll()
      .where('account_id', '=', userId)
      .orderBy('sequence')
      .execute();

  const ordersOf = (userId: number) =>
    migrator.selectFrom('orders').selectAll().where('userid', '=', userId).orderBy('id').execute();

  it('un ingreso se guarda como orden con su evento, y el portfolio lo refleja', async () => {
    const response = await transfer(2, 'CASH_IN', 200000.5);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      userId: 2,
      instrumentId: 66,
      side: 'CASH_IN',
      type: 'MARKET',
      size: '200000.50',
      price: '1.00',
      status: 'FILLED',
      rejectReason: null,
    });

    const [order] = await ordersOf(2);
    const [event] = await eventsOf(2);
    expect(event).toMatchObject({
      sequence: 1,
      event_type: 'CashTransferredIn',
      order_id: order!.id,
      payload: { orderId: order!.id, amount: '200000.50' },
      metadata: { source: 'api', correlationId: 'test-2-CASH_IN' },
    });

    const portfolio = await app.inject({ method: 'GET', url: '/v1/users/2/portfolio' });
    expect(portfolio.json().cash.available).toBe('200000.50');
  });

  it('un retiro que supera lo disponible se guarda rechazado, después de los eventos semilla', async () => {
    // Usuario 1: 627.500 disponibles de 753.000.
    const response = await transfer(1, 'CASH_OUT', 700000);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_FUNDS' });

    const events = await eventsOf(1);
    expect(events).toHaveLength(12);
    expect(events.at(-1)).toMatchObject({
      sequence: 12,
      event_type: 'OrderRejected',
      payload: { side: 'CASH_OUT', size: '700000.00', price: '1.00', reason: 'INSUFFICIENT_FUNDS' },
    });
  });

  it('si falla el insert del evento, no queda la orden', async () => {
    // Le saca a la aplicación el permiso de escribir el historial: la orden se
    // inserta, el evento falla, y la transacción tiene que deshacer la orden.
    await sql`REVOKE INSERT ON account_events FROM cocos_app`.execute(migrator);
    try {
      const response = await transfer(4, 'CASH_IN', 500);

      expect(response.statusCode).toBe(500);
      expect(await ordersOf(4)).toEqual([]);
      expect(await eventsOf(4)).toEqual([]);
    } finally {
      await sql`GRANT INSERT ON account_events TO cocos_app`.execute(migrator);
    }
  });

  it('de dos retiros simultáneos que juntos superan los fondos, uno se rechaza', async () => {
    const cashOut = (amount: string) =>
      transferCash.execute({
        userId: 2,
        type: 'CASH_OUT',
        amount: Money.of(amount),
        correlationId: null,
        idempotency: null,
      });

    await cashOut('199000.50');
    // Quedan 1.000 pesos: cada retiro de 600 alcanza solo, los dos juntos no.
    const results = await Promise.all([cashOut('600'), cashOut('600')]);

    expect(results.map(({ order }) => order.status).sort()).toEqual(['FILLED', 'REJECTED']);
    const portfolio = await app.inject({ method: 'GET', url: '/v1/users/2/portfolio' });
    expect(portfolio.json().cash.total).toBe('400.00');
  });
});
