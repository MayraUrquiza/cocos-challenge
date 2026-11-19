import type { Kysely } from 'kysely';
import { PlaceOrderHandler } from '../../src/application/use-cases/commands/place-order';
import { TransferCashHandler } from '../../src/application/use-cases/commands/transfer-cash';
import { GetPortfolioHandler } from '../../src/application/use-cases/queries/get-portfolio';
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

const PAMP = 47;
const BMA = 31;
const PGR = 3;
const ARS = 66;

describe('POST /v1/users/{userId}/orders', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let migrator: Kysely<DB>;
  let app: App;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    migrator = createDatabase(testDb.migratorUrl);
    const accounts = new PostgresAccountRepository(db);
    const instruments = new PostgresInstrumentFinder(db);
    const prices = new PostgresPriceProvider(db);
    const clock = new SystemClock();
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({
        placeOrder: new PlaceOrderHandler(accounts, instruments, prices, clock),
        transferCash: new TransferCashHandler(accounts, instruments, clock),
        getPortfolio: new GetPortfolioHandler(new PostgresPortfolioFinder(db), prices),
      }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await migrator?.destroy();
    await db?.destroy();
    await testDb?.drop();
  });

  const placeOrder = (payload: object, userId = 1) =>
    app.inject({ method: 'POST', url: `/v1/users/${userId}/orders`, payload });
  const portfolio = async (userId = 1) =>
    (await app.inject({ method: 'GET', url: `/v1/users/${userId}/portfolio` })).json();

  // Usuario 1: 753.000 pesos, 125.500 reservados, 627.500 disponibles.
  it('una compra que supera lo disponible, aunque no los pesos totales, queda REJECTED', async () => {
    const response = await placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'LIMIT', size: 700, price: 1000 });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'INSUFFICIENT_FUNDS',
      size: '700',
      price: '1000.00',
    });
  });

  it('una MARKET por monto compra las acciones enteras que alcanzan, al último precio, y queda FILLED', async () => {
    // 50.000 / 925,85 = 54 acciones (ejemplo del RFC).
    const response = await placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', amount: 50000 });

    expect(response.statusCode).toBe(201);
    const order = response.json();
    expect(order).toMatchObject({ side: 'BUY', type: 'MARKET', size: '54', price: '925.85', status: 'FILLED' });

    // El historial conserva el monto pedido (ADR-0003, punto 2).
    const event = await migrator
      .selectFrom('account_events')
      .select(['event_type', 'payload'])
      .where('order_id', '=', order.id)
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({ event_type: 'OrderFilled', payload: { requestedAmount: '50000.00' } });

    // 753.000 − 54 × 925,85 = 703.004,10.
    expect((await portfolio()).cash.total).toBe('703004.10');
  });

  it('una LIMIT queda NEW y aparta los pesos que va a usar', async () => {
    const response = await placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'LIMIT', size: 10, price: 900 });

    expect(response.json()).toMatchObject({ type: 'LIMIT', size: '10', price: '900.00', status: 'NEW' });
    expect((await portfolio()).cash).toMatchObject({ total: '703004.10', reserved: '134500.00' });
  });

  it('una venta sobre la tenencia negativa de BMA queda REJECTED', async () => {
    const response = await placeOrder({ instrumentId: BMA, side: 'SELL', type: 'MARKET', size: 1 });

    expect(response.json()).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_HOLDINGS' });
  });

  it('una MARKET sin precios cargados queda REJECTED, sin precio', async () => {
    const response = await placeOrder({ instrumentId: PGR, side: 'BUY', type: 'MARKET', size: 5 });

    expect(response.json()).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'NO_MARKET_PRICE',
      size: '5',
      price: null,
    });
  });

  it('un monto que no alcanza para una acción queda REJECTED con cantidad 0', async () => {
    const response = await placeOrder({ instrumentId: BMA, side: 'BUY', type: 'MARKET', amount: 100 });

    expect(response.json()).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'ZERO_QUANTITY',
      size: '0',
      price: '1502.80',
    });
  });

  it('un request mal armado responde 400 y no guarda nada (ADR-0001)', async () => {
    const before = await migrator.selectFrom('orders').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();

    const both = await placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 1, amount: 1000 });
    const marketWithPrice = await placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 1, price: 900 });
    const limitWithoutPrice = await placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'LIMIT', size: 1 });

    expect(both.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'amount', message: 'se debe enviar size o amount, no ambos' }],
    });
    expect(marketWithPrice.json().details).toEqual([{ field: 'price', message: 'price no es un campo permitido' }]);
    expect(limitWithoutPrice.json().details).toEqual([{ field: 'price', message: 'price es obligatorio' }]);
    const after = await migrator.selectFrom('orders').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
    expect(after.n).toBe(before.n);
  });

  it('operar pesos responde 400 INSTRUMENT_NOT_TRADABLE y un instrumento inexistente 404', async () => {
    const pesos = await placeOrder({ instrumentId: ARS, side: 'BUY', type: 'MARKET', size: 1 });
    const missing = await placeOrder({ instrumentId: 9999, side: 'BUY', type: 'MARKET', size: 1 });

    expect(pesos.statusCode).toBe(400);
    expect(pesos.json()).toMatchObject({ code: 'INSTRUMENT_NOT_TRADABLE' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'INSTRUMENT_NOT_FOUND' });
  });

  it('de dos compras simultáneas que juntas superan los fondos, una queda REJECTED', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/users/3/transfers',
      payload: { type: 'CASH_IN', amount: 1000 },
    });

    // Cada una cuesta 925,85: alcanza para una sola.
    const results = await Promise.all([
      placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 1 }, 3),
      placeOrder({ instrumentId: PAMP, side: 'BUY', type: 'MARKET', size: 1 }, 3),
    ]);

    expect(results.map((response) => response.json().status).sort()).toEqual(['FILLED', 'REJECTED']);
  });
});
