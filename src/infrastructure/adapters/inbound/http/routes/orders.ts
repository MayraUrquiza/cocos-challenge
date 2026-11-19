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
import { described, errorResponse, ValidationError } from '../schemas/responses';

export interface OrderRoutesOptions {
  getOrder: GetOrder;
  listOrders: ListOrders;
  placeOrder: PlaceOrder;
  cancelOrder: CancelOrder;
}

const UserNotFound = errorResponse('`USER_NOT_FOUND`: el usuario no existe.');

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
        response: {
          200: described(OrderResponse, 'La orden cancelada, en `CANCELLED`.'),
          400: ValidationError,
          404: errorResponse('`ORDER_NOT_FOUND`: la orden no existe o es de otro usuario.'),
          409: errorResponse('`ORDER_NOT_PENDING`: la orden ya no está `NEW`.'),
        },
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
        response: {
          200: described(ListOrdersResponse, 'Una página de órdenes, con el total.'),
          400: ValidationError,
          404: UserNotFound,
        },
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
        response: {
          200: described(OrderResponse, 'La orden.'),
          400: ValidationError,
          404: errorResponse(
            '`USER_NOT_FOUND` si el usuario no existe, u `ORDER_NOT_FOUND` si la orden no existe o es de otro usuario.',
          ),
        },
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
        response: {
          201: described(
            OrderResponse,
            'Orden registrada: `FILLED` (MARKET), `NEW` (LIMIT) o `REJECTED` con su `rejectReason`. ' +
              'Un reintento con la misma `Idempotency-Key` devuelve la orden original.',
          ),
          400: errorResponse(
            'Request inválido (`VALIDATION_ERROR`, con el detalle en `details`), ' +
              'u orden sobre pesos (`INSTRUMENT_NOT_TRADABLE`).',
          ),
          404: errorResponse('`USER_NOT_FOUND` o `INSTRUMENT_NOT_FOUND`.'),
          409: errorResponse('`IDEMPOTENCY_KEY_REUSED`: la clave ya se usó con otro body.'),
        },
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
