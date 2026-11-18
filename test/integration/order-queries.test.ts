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

describe('consulta de órdenes contra PostgreSQL', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let orders: PostgresOrderFinder;
  let users: PostgresUserFinder;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    orders = new PostgresOrderFinder(db);
    users = new PostgresUserFinder(db);
  });

  afterAll(async () => {
    await db?.destroy();
    await testDb?.drop();
  });

  describe('PostgresOrderFinder', () => {
    it('lista las órdenes del usuario de la más nueva a la más vieja', async () => {
      const { items, total } = await orders.listByUser({ userId: 1, limit: 100, offset: 0 });

      expect(total).toBe(11);
      expect(items.map((order) => order.id)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    });

    it('pagina en el mismo orden, con el total completo', async () => {
      const { items, total } = await orders.listByUser({ userId: 1, limit: 3, offset: 3 });

      expect(total).toBe(11);
      expect(items.map((order) => order.id)).toEqual([8, 7, 6]);
    });

    it('un usuario sin órdenes tiene una lista vacía', async () => {
      await expect(orders.listByUser({ userId: 2, limit: 20, offset: 0 })).resolves.toEqual({
        items: [],
        total: 0,
      });
    });

    it('trae la orden con sus valores del dominio', async () => {
      const order = await orders.findById({ userId: 1, orderId: 6 });

      expect(order).toMatchObject({
        id: 6,
        userId: 1,
        instrumentId: 47,
        side: 'SELL',
        type: 'MARKET',
        status: 'REJECTED',
        rejectReason: null,
      });
      expect(order!.size?.toString()).toBe('100');
      expect(order!.price?.toString()).toBe('950.00');
      expect(order!.datetime.toISOString()).toBe('2023-07-12T16:11:20.000Z');
    });

    it('las transferencias muestran su monto con centavos', async () => {
      const cashIn = await orders.findById({ userId: 1, orderId: 1 });

      expect(cashIn).toMatchObject({ side: 'CASH_IN', instrumentId: 66 });
      expect(cashIn!.size?.toString()).toBe('1000000.00');
    });

    it('no encuentra la orden de otro usuario', async () => {
      await expect(orders.findById({ userId: 2, orderId: 6 })).resolves.toBeNull();
    });
  });

  describe('PostgresUserFinder', () => {
    it('distingue usuarios existentes de inexistentes', async () => {
      await expect(users.exists(1)).resolves.toBe(true);
      await expect(users.exists(4)).resolves.toBe(true);
      await expect(users.exists(999)).resolves.toBe(false);
    });
  });

  describe('rutas de punta a punta', () => {
    let app: App;

    beforeAll(async () => {
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
    });

    it('GET /v1/users/1/orders/2 devuelve la compra de PAMP', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/users/1/orders/2' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: 2,
        userId: 1,
        instrumentId: 47,
        side: 'BUY',
        type: 'MARKET',
        size: '50',
        price: '930.00',
        status: 'FILLED',
        rejectReason: null,
        datetime: '2023-07-12T12:31:20.000Z',
      });
    });

    it('GET /v1/users/1/orders?limit=2 devuelve las dos más nuevas', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/users/1/orders?limit=2' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ total: 11, limit: 2, offset: 0 });
      expect(response.json().items.map((order: { id: number }) => order.id)).toEqual([11, 10]);
    });

    it('la orden de otro usuario responde 404 ORDER_NOT_FOUND', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/users/2/orders/1' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });

    it('un usuario inexistente responde 404 USER_NOT_FOUND', async () => {
      const list = await app.inject({ method: 'GET', url: '/v1/users/999/orders' });
      const detail = await app.inject({ method: 'GET', url: '/v1/users/999/orders/1' });

      expect(list.json()).toMatchObject({ code: 'USER_NOT_FOUND' });
      expect(detail.json()).toMatchObject({ code: 'USER_NOT_FOUND' });
    });
  });
});
