import { Type } from 'typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FillOrder } from '../../../../../application/ports/inbound/fill-order';
import { toOrderResponse } from '../mappers/order-response';
import { OrderResponse } from '../schemas/orders';
import { described, errorResponse, ValidationError } from '../schemas/responses';

export interface SimulationRoutesOptions {
  fillOrder: FillOrder;
}

/**
 * Simulación del mercado, solo para pruebas (ADR-0005, punto 6). Vive bajo
 * /v1/simulation y no bajo el usuario porque representa al mercado. Solo se
 * registra con MARKET_SIMULATION_ENABLED: apagada, la ruta no existe.
 */
export const simulationRoutes: FastifyPluginAsyncTypebox<SimulationRoutesOptions> = async (
  app,
  { fillOrder },
) => {
  app.post(
    '/simulation/orders/:orderId/fill',
    {
      schema: {
        tags: ['simulación'],
        summary: 'Ejecuta una orden LIMIT pendiente (solo para pruebas)',
        description:
          'Simula que el mercado ejecutó la orden, al precio límite y por la cantidad completa, ' +
          'sin volver a validar fondos. Una orden que no está pendiente responde 409 ORDER_NOT_PENDING. ' +
          'Solo existe con MARKET_SIMULATION_ENABLED=true.',
        params: Type.Object(
          { orderId: Type.Integer({ minimum: 1, description: 'Número de orden' }) },
          { additionalProperties: false },
        ),
        response: {
          200: described(OrderResponse, 'La orden ejecutada, en `FILLED`.'),
          400: ValidationError,
          404: errorResponse('`ORDER_NOT_FOUND`: la orden no existe.'),
          409: errorResponse('`ORDER_NOT_PENDING`: la orden ya no está `NEW`.'),
        },
      },
    },
    async (request) => {
      const order = await fillOrder.execute({ orderId: request.params.orderId, correlationId: request.id });
      request.log.info(
        { userId: order.userId, orderId: order.id, status: order.status },
        'orden ejecutada por la simulación',
      );
      return toOrderResponse(order);
    },
  );
};
