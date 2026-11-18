import type { OrderFinder } from '../../../src/application/ports/outbound/order-finder';
import type { UserFinder } from '../../../src/application/ports/outbound/user-finder';
import { OrderNotFoundError, UserNotFoundError } from '../../../src/application/shared/errors';
import type { OrderView } from '../../../src/application/shared/order-view';
import { GetOrderHandler } from '../../../src/application/use-cases/queries/get-order';
import { ListOrdersHandler } from '../../../src/application/use-cases/queries/list-orders';
import { anOrder } from '../../support/orders';

function inMemory(userIds: number[], orders: OrderView[]) {
  const users: UserFinder = { exists: async (userId) => userIds.includes(userId) };
  const ordersFinder: OrderFinder = {
    findById: async ({ userId, orderId }) =>
      orders.find((order) => order.id === orderId && order.userId === userId) ?? null,
    listByUser: async ({ userId, limit, offset }) => {
      const own = orders.filter((order) => order.userId === userId);
      return { items: own.slice(offset, offset + limit), total: own.length };
    },
  };
  return { users, orders: ordersFinder };
}

describe('GetOrderHandler', () => {
  const order = anOrder({ id: 5, userId: 1 });
  const { users, orders } = inMemory([1, 2], [order]);
  const getOrder = new GetOrderHandler(users, orders);

  it('devuelve la orden del usuario', async () => {
    await expect(getOrder.execute({ userId: 1, orderId: 5 })).resolves.toBe(order);
  });

  it('una orden de otro usuario es ORDER_NOT_FOUND, sin revelar que existe', async () => {
    await expect(getOrder.execute({ userId: 2, orderId: 5 })).rejects.toThrow(OrderNotFoundError);
  });

  it('una orden inexistente es ORDER_NOT_FOUND', async () => {
    await expect(getOrder.execute({ userId: 1, orderId: 99 })).rejects.toThrow(OrderNotFoundError);
  });

  it('un usuario inexistente es USER_NOT_FOUND', async () => {
    await expect(getOrder.execute({ userId: 999, orderId: 5 })).rejects.toThrow(UserNotFoundError);
  });
});

describe('ListOrdersHandler', () => {
  const own = [anOrder({ id: 3 }), anOrder({ id: 2 }), anOrder({ id: 1 })];
  const { users, orders } = inMemory([1, 2], [...own, anOrder({ id: 4, userId: 2 })]);
  const listOrders = new ListOrdersHandler(users, orders);

  it('devuelve la página de órdenes del usuario con el total y la paginación pedida', async () => {
    const page = await listOrders.execute({ userId: 1, limit: 2, offset: 1 });

    expect(page.items.map((order) => order.id)).toEqual([2, 1]);
    expect(page).toMatchObject({ total: 3, limit: 2, offset: 1 });
  });

  it('un usuario sin órdenes recibe una página vacía', async () => {
    const { users: noOrdersUsers, orders: noOrders } = inMemory([3], []);
    const page = await new ListOrdersHandler(noOrdersUsers, noOrders).execute({
      userId: 3,
      limit: 20,
      offset: 0,
    });

    expect(page).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('un usuario inexistente es USER_NOT_FOUND, no una lista vacía', async () => {
    await expect(listOrders.execute({ userId: 999, limit: 20, offset: 0 })).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
