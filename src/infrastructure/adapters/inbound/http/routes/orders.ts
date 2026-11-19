import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { CancelOrder } from '../../../../../application/ports/inbound/cancel-order';
import type { GetOrder } from '../../../../../application/ports/inbound/get-order';
import type { ListOrders } from '../../../../../application/ports/inbound/list-orders';
import type { PlaceOrder } from '../../../../../application/ports/inbound/place-order';
import { Money } from '../../../../../domain/shared/money';
import { Quantity } from '../../../../../domain/shared/quantity';
import { IdempotencyHeaders, idempotencyOf } from '../idempotency';
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
  cancelOrder: CancelOrder;
}

const ErrorResponse = { $ref: 'ErrorResponse#' };

export const orderRoutes: FastifyPluginAsyncTypebox<OrderRoutesOptions> = async (
  app,
  { getOrder, listOrders, placeOrder, cancelOrder },
) => {
  app.post(
    '/users/:userId/orders/:orderId/cancel',
    {
      schema: {
        tags: ['órdenes'],
        summary: 'Cancela una orden pendiente',
        description:
          'Solo una orden NEW: libera los pesos o las acciones que apartaba. ' +
          'Una orden que ya no está pendiente responde 409 ORDER_NOT_PENDING, ' +
          'y una de otro usuario 404 ORDER_NOT_FOUND.',
        params: UserOrderParams,
        response: { 200: OrderResponse, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request) => {
      const order = await cancelOrder.execute({ ...request.params, correlationId: request.id });
      request.log.info(
        { userId: order.userId, orderId: order.id, status: order.status },
        'orden cancelada',
      );
      return toOrderResponse(order);
    },
  );

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
        headers: IdempotencyHeaders,
        body: PlaceOrderBody,
        response: { 201: OrderResponse, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const body = request.body;
      const { order, replayed } = await placeOrder.execute({
        userId,
        instrumentId: body.instrumentId,
        side: body.side,
        quantity:
          body.size !== undefined
            ? { size: Quantity.of(body.size, 0) }
            : { amount: Money.of(body.amount!) },
        correlationId: request.id,
        idempotency: idempotencyOf(
          request.headers['idempotency-key'],
          `${request.method} ${request.routeOptions.url}`,
          body,
        ),
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
          replayed,
        },
        replayed ? 'reintento detectado: se devuelve la orden original' : 'orden registrada',
      );

      return reply.code(201).send(toOrderResponse(order));
    },
  );
};
