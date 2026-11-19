import type { Kysely } from 'kysely';
import { CancelOrderHandler } from '../../src/application/use-cases/commands/cancel-order';
import { FillOrderHandler } from '../../src/application/use-cases/commands/fill-order';
import { PlaceOrderHandler } from '../../src/application/use-cases/commands/place-order';
import { TransferCashHandler } from '../../src/application/use-cases/commands/transfer-cash';
import { ReconcileAccountsHandler } from '../../src/application/use-cases/queries/reconcile-accounts';
import { Money } from '../../src/domain/shared/money';
import { Quantity } from '../../src/domain/shared/quantity';
import { PostgresAccountEventsFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-account-events-finder';
import { PostgresInstrumentFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-instrument-finder';
import { PostgresOrderFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-order-finder';
import { PostgresPriceProvider } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-price-provider';
import { PostgresAccountRepository } from '../../src/infrastructure/adapters/outbound/postgres/repositories/postgres-account-repository';
import { SystemClock } from '../../src/infrastructure/adapters/outbound/system/system-clock';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';

const PAMP = 47;
const PGR = 3;

describe('Reconciliación entre orders y account_events (ADR-0003, punto 2)', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let migrator: Kysely<DB>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    migrator = createDatabase(testDb.migratorUrl);
  });

  afterAll(async () => {
    await migrator?.destroy();
    await db?.destroy();
    await testDb?.drop();
  });

  const reconcile = () => new ReconcileAccountsHandler(new PostgresAccountEventsFinder(db)).execute();

  it('después de operar con todos los comandos, las dos tablas coinciden en todas las cuentas', async () => {
    const accounts = new PostgresAccountRepository(db);
    const instruments = new PostgresInstrumentFinder(db);
    const orders = new PostgresOrderFinder(db);
    const clock = new SystemClock();
    const transfer = new TransferCashHandler(accounts, instruments, clock);
    const place = new PlaceOrderHandler(accounts, instruments, new PostgresPriceProvider(db), clock);
    const cancel = new CancelOrderHandler(accounts, orders, clock);
    const fill = new FillOrderHandler(accounts, orders, clock);
    const base = { userId: 2, correlationId: null, idempotency: null };
    const limit = (side: 'BUY' | 'SELL', size: number, price: number) =>
      place.execute({
        ...base,
        instrumentId: PAMP,
        side,
        type: 'LIMIT',
        quantity: { size: Quantity.of(size, 0) },
        price: Money.of(price),
      });
    const market = (instrumentId: number, quantity: { size: Quantity } | { amount: Money }) =>
      place.execute({ ...base, instrumentId, side: 'BUY', type: 'MARKET', quantity });

    await transfer.execute({ ...base, type: 'CASH_IN', amount: Money.of('100000.50') });
    const filled = await limit('BUY', 10, 900);
    const cancelled = await limit('BUY', 5, 800);
    await fill.execute({ orderId: filled.order.id, correlationId: null });
    await cancel.execute({ ...base, orderId: cancelled.order.id });
    await market(PAMP, { amount: Money.of(5000) });
    await limit('SELL', 2, 1000); // queda pendiente
    await market(PGR, { size: Quantity.of(1, 0) }); // REJECTED, sin precio
    await transfer.execute({ ...base, type: 'CASH_OUT', amount: Money.of(10_000_000) }); // REJECTED
    // Órdenes semilla, que solo tienen su LegacyOrderImported: una se cancela y otra se ejecuta.
    await cancel.execute({ userId: 1, orderId: 5, correlationId: null });
    await fill.execute({ orderId: 7, correlationId: null });

    const report = await reconcile();

    expect(report.accountsChecked).toBeGreaterThanOrEqual(2);
    expect(report.accountsWithDifferences).toEqual([]);
  });

  it('detecta una orden insertada en orders sin su evento', async () => {
    await migrator
      .insertInto('orders')
      .values({
        userid: 3,
        instrumentid: 66,
        side: 'CASH_IN',
        type: 'MARKET',
        size: '500',
        price: '1',
        status: 'FILLED',
        datetime: new Date(),
      })
      .execute();

    const report = await reconcile();

    expect(report.accountsWithDifferences).toEqual([
      { accountId: 3, differences: [{ kind: 'CASH', fromHistory: '0.00', fromOrders: '500.00' }] },
    ]);
  });
});
