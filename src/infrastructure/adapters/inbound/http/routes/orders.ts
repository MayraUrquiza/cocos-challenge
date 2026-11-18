import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { GetOrder } from '../../../../../application/ports/inbound/get-order';
import type { ListOrders } from '../../../../../application/ports/inbound/list-orders';
import { toListOrdersResponse, toOrderResponse } from '../mappers/order-response';
import {
  ListOrdersQuerystring,
  ListOrdersResponse,
  OrderResponse,
  UserOrderParams,
  UserParams,
} from '../schemas/orders';

export interface OrderRoutesOptions {
  getOrder: GetOrder;
  listOrders: ListOrders;
}

const ErrorResponse = { $ref: 'ErrorResponse#' };

export const orderRoutes: FastifyPluginAsyncTypebox<OrderRoutesOptions> = async (
  app,
  { getOrder, listOrders },
) => {
  app.get(
    '/users/:userId/orders',
    {
      schema: {
        tags: ['órdenes'],
        summary: 'Lista las órdenes del usuario',
        description:
          'De la más nueva a la más vieja. Incluye las transferencias de pesos (`CASH_IN` / `CASH_OUT`).',
        params: UserParams,
        querystring: ListOrdersQuerystring,
        response: { 200: ListOrdersResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request) => {
      const page = await listOrders.execute({ ...request.params, ...request.query });
      return toListOrdersResponse(page);
    },
  );

  app.get(
    '/users/:userId/orders/:orderId',
    {
      schema: {
        tags: ['órdenes'],
        summary: 'Detalle de una orden del usuario',
        description: 'Una orden de otro usuario responde `404 ORDER_NOT_FOUND`.',
        params: UserOrderParams,
        response: { 200: OrderResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request) => toOrderResponse(await getOrder.execute(request.params)),
  );
};
