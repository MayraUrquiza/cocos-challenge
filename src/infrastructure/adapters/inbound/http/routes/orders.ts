import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { GetOrder } from '../../../../../application/ports/inbound/get-order';
import type { ListOrders } from '../../../../../application/ports/inbound/list-orders';
import type { PlaceOrder } from '../../../../../application/ports/inbound/place-order';
import { Money } from '../../../../../domain/shared/money';
import { Quantity } from '../../../../../domain/shared/quantity';
import { toListOrdersResponse, toOrderResponse } from '../mappers/order-response';
import {
  ListOrdersQuerystring,
  ListOrdersResponse,
  OrderResponse,
  PlaceOrderBody,
  UserOrderParams,
  UserParams,
} from '../schemas/orders';

export interface OrderRoutesOptions {
  getOrder: GetOrder;
  listOrders: ListOrders;
  placeOrder: PlaceOrder;
}

const ErrorResponse = { $ref: 'ErrorResponse#' };

export const orderRoutes: FastifyPluginAsyncTypebox<OrderRoutesOptions> = async (
  app,
  { getOrder, listOrders, placeOrder },
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

  app.post(
    '/users/:userId/orders',
    {
      schema: {
        tags: ['órdenes'],
        summary: 'Envía una orden de compra o venta',
        description:
          'MARKET se ejecuta al último precio y queda FILLED. LIMIT exige `price` y queda NEW. ' +
          'Se envía `size` (acciones) o `amount` (pesos a invertir), no ambos. ' +
          'Una orden que no cumple una regla de negocio responde 201 con `status: REJECTED` y su `rejectReason`.',
        params: UserParams,
        body: PlaceOrderBody,
        response: { 201: OrderResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const body = request.body;
      const order = await placeOrder.execute({
        userId,
        instrumentId: body.instrumentId,
        side: body.side,
        quantity:
          body.size !== undefined
            ? { size: Quantity.of(body.size, 0) }
            : { amount: Money.of(body.amount!) },
        correlationId: request.id,
        ...(body.type === 'LIMIT'
          ? { type: 'LIMIT' as const, price: Money.of(body.price) }
          : { type: 'MARKET' as const }),
      });

      request.log.info(
        {
          userId,
          orderId: order.id,
          instrumentId: order.instrumentId,
          side: order.side,
          type: order.type,
          status: order.status,
          rejectReason: order.rejectReason,
        },
        'orden registrada',
      );

      return reply.code(201).send(toOrderResponse(order));
    },
  );
};
