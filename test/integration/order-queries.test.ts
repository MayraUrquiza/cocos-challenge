import type { Kysely } from 'kysely';
import { GetOrderHandler } from '../../src/application/use-cases/queries/get-order';
import { ListOrdersHandler } from '../../src/application/use-cases/queries/list-orders';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresOrderFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-order-finder';
import { PostgresUserFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-user-finder';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

describe('consulta de órdenes', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let app: App;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    const users = new PostgresUserFinder(db);
    const orders = new PostgresOrderFinder(db);
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({
        getOrder: new GetOrderHandler(users, orders),
        listOrders: new ListOrdersHandler(users, orders),
      }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await testDb?.drop();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('lista las órdenes del usuario de la más nueva a la más vieja, paginadas', async () => {
    const response = await get('/v1/users/1/orders?limit=3&offset=3');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 11, limit: 3, offset: 3 });
    expect(response.json().items.map((order: { id: number }) => order.id)).toEqual([8, 7, 6]);
  });

  it('el detalle trae la orden con montos como texto y fecha en UTC', async () => {
    const response = await get('/v1/users/1/orders/1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 1,
      userId: 1,
      instrumentId: 66,
      side: 'CASH_IN',
      type: 'MARKET',
      size: '1000000.00',
      price: '1.00',
      status: 'FILLED',
      rejectReason: null,
      datetime: '2023-07-12T12:11:20.000Z',
    });
  });

  it('la orden de otro usuario responde 404 ORDER_NOT_FOUND, sin revelar que existe', async () => {
    const response = await get('/v1/users/2/orders/1');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('un usuario inexistente responde 404 USER_NOT_FOUND', async () => {
    expect((await get('/v1/users/999/orders')).json()).toMatchObject({ code: 'USER_NOT_FOUND' });
    expect((await get('/v1/users/999/orders/1')).json()).toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});
