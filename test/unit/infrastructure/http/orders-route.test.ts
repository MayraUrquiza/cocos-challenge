import type { GetOrder } from '../../../../src/application/ports/inbound/get-order';
import type { ListOrders } from '../../../../src/application/ports/inbound/list-orders';
import { OrderNotFoundError, UserNotFoundError } from '../../../../src/application/shared/errors';
import { Quantity } from '../../../../src/domain/shared/quantity';
import { buildApp, type App } from '../../../../src/infrastructure/adapters/inbound/http/app';
import { anOrder } from '../../../support/orders';
import { stubUseCases } from '../../../support/use-cases';

describe('rutas de consulta de órdenes', () => {
  let app: App;
  let getOrder: jest.MockedFunction<GetOrder['execute']>;
  let listOrders: jest.MockedFunction<ListOrders['execute']>;

  beforeEach(async () => {
    getOrder = jest.fn();
    listOrders = jest.fn();
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({
        getOrder: { execute: getOrder },
        listOrders: { execute: listOrders },
      }),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  describe('GET /v1/users/{userId}/orders/{orderId}', () => {
    it('responde la orden con la forma del RFC', async () => {
      getOrder.mockResolvedValue(anOrder());

      const response = await get('/v1/users/1/orders/12');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: 12,
        userId: 1,
        instrumentId: 47,
        side: 'BUY',
        type: 'MARKET',
        size: '54',
        price: '925.85',
        status: 'FILLED',
        rejectReason: null,
        datetime: '2026-11-17T14:02:11.000Z',
      });
      expect(getOrder).toHaveBeenCalledWith({ userId: 1, orderId: 12 });
    });

    it('una transferencia muestra el monto con centavos', async () => {
      getOrder.mockResolvedValue(
        anOrder({ side: 'CASH_IN', instrumentId: 66, size: Quantity.of('200000.5', 2) }),
      );

      const response = await get('/v1/users/1/orders/12');

      expect(response.json()).toMatchObject({ side: 'CASH_IN', size: '200000.50' });
    });

    it('una orden rechazada sin precio ni cantidad los devuelve en null, con el motivo', async () => {
      getOrder.mockResolvedValue(
        anOrder({ status: 'REJECTED', rejectReason: 'NO_MARKET_PRICE', size: null, price: null }),
      );

      const response = await get('/v1/users/1/orders/12');

      expect(response.json()).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'NO_MARKET_PRICE',
        size: null,
        price: null,
      });
    });

    it.each([
      [new OrderNotFoundError(12), 'ORDER_NOT_FOUND', 'La orden 12 no existe'],
      [new UserNotFoundError(1), 'USER_NOT_FOUND', 'El usuario 1 no existe'],
    ])('%s responde 404 con su código', async (error, code, message) => {
      getOrder.mockRejectedValue(error);

      const response = await get('/v1/users/1/orders/12');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', code, message });
    });

    it.each([
      ['/v1/users/abc/orders/12', 'userId'],
      ['/v1/users/0/orders/12', 'userId'],
      ['/v1/users/1/orders/1.5', 'orderId'],
    ])('%s responde 400 VALIDATION_ERROR', async (url, field) => {
      const response = await get(url);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ field }] });
      expect(getOrder).not.toHaveBeenCalled();
    });
  });

  describe('GET /v1/users/{userId}/orders', () => {
    it('responde la página de órdenes', async () => {
      listOrders.mockResolvedValue({ items: [anOrder()], total: 11, limit: 1, offset: 0 });

      const response = await get('/v1/users/1/orders?limit=1');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ total: 11, limit: 1, offset: 0 });
      expect(response.json().items).toHaveLength(1);
      expect(listOrders).toHaveBeenCalledWith({ userId: 1, limit: 1, offset: 0 });
    });

    it('usa limit 20 y offset 0 por defecto', async () => {
      listOrders.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

      await get('/v1/users/1/orders');

      expect(listOrders).toHaveBeenCalledWith({ userId: 1, limit: 20, offset: 0 });
    });

    it('un usuario inexistente responde 404 USER_NOT_FOUND', async () => {
      listOrders.mockRejectedValue(new UserNotFoundError(999));

      const response = await get('/v1/users/999/orders');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'USER_NOT_FOUND' });
    });

    it('limit fuera de rango responde 400', async () => {
      const response = await get('/v1/users/1/orders?limit=0');

      expect(response.statusCode).toBe(400);
      expect(listOrders).not.toHaveBeenCalled();
    });
  });

  it('las dos rutas aparecen en el OpenAPI', async () => {
    const response = await get('/docs/json');

    expect(Object.keys(response.json().paths)).toEqual(
      expect.arrayContaining(['/v1/users/{userId}/orders', '/v1/users/{userId}/orders/{orderId}']),
    );
  });
});
