import type { Kysely } from 'kysely';
import { PlaceOrderHandler } from '../../src/application/use-cases/commands/place-order';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresInstrumentFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-instrument-finder';
import { PostgresPriceProvider } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-price-provider';
import { PostgresAccountRepository } from '../../src/infrastructure/adapters/outbound/postgres/repositories/postgres-account-repository';
import { SystemClock } from '../../src/infrastructure/adapters/outbound/system/system-clock';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

const PAMP = 47;

describe('Idempotency-Key', () => {
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
        placeOrder: new PlaceOrderHandler(
          new PostgresAccountRepository(db),
          new PostgresInstrumentFinder(db),
          new PostgresPriceProvider(db),
          new SystemClock(),
        ),
      }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await migrator?.destroy();
    await db?.destroy();
    await testDb?.drop();
  });

  const placeOrder = (key: string, payload: object) =>
    app.inject({
      method: 'POST',
      url: '/v1/users/1/orders',
      headers: { 'idempotency-key': key },
      payload,
    });

  const recordedWith = async (key: string) => {
    const orders = await migrator
      .selectFrom('orders')
      .select('id')
      .where('userid', '=', 1)
      .where('idempotencykey', '=', key)
      .execute();
    const events = await migrator
      .selectFrom('account_events')
      .select('id')
      .where('order_id', 'in', orders.length > 0 ? orders.map((order) => order.id) : [-1])
      .execute();
    return { orders: orders.length, events: events.length };
  };

  it('un reintento devuelve la orden original, y con otro body responde 409', async () => {
    const first = await placeOrder('compra-1', { instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 2 });
    // El mismo pedido, con las claves en otro orden.
    const retry = await placeOrder('compra-1', { size: 2, type: 'MARKET', side: 'BUY', instrumentId: PAMP });
    const otherBody = await placeOrder('compra-1', { instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 3 });

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual(first.json());
    expect(otherBody.statusCode).toBe(409);
    expect(otherBody.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await recordedWith('compra-1')).toEqual({ orders: 1, events: 1 });
  });

  it('un rechazo también guarda la clave: el reintento devuelve el mismo rechazo', async () => {
    const payload = { instrumentId: PAMP, side: 'SELL', type: 'MARKET', size: 1000 };

    const first = await placeOrder('venta-1', payload);
    const retry = await placeOrder('venta-1', payload);

    expect(first.json()).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_HOLDINGS' });
    expect(retry.json()).toEqual(first.json());
    expect(await recordedWith('venta-1')).toEqual({ orders: 1, events: 1 });
  });

  it('dos reintentos simultáneos con la misma clave crean una sola orden y un solo evento', async () => {
    const payload = { instrumentId: PAMP, side: 'BUY', type: 'LIMIT', size: 1, price: 900 };

    const [a, b] = await Promise.all([placeOrder('limit-1', payload), placeOrder('limit-1', payload)]);

    expect(a.statusCode).toBe(201);
    expect(b.json()).toEqual(a.json());
    expect(await recordedWith('limit-1')).toEqual({ orders: 1, events: 1 });
  });
});
