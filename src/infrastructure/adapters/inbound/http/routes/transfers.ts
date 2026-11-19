import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { TransferCash } from '../../../../../application/ports/inbound/transfer-cash';
import { Money } from '../../../../../domain/shared/money';
import { IdempotencyHeaders, idempotencyOf } from '../idempotency';
import { toOrderResponse } from '../mappers/order-response';
import { OrderResponse } from '../schemas/orders';
import { TransferBody, TransferParams } from '../schemas/transfers';

export interface TransferRoutesOptions {
  transferCash: TransferCash;
}

const ErrorResponse = { $ref: 'ErrorResponse#' };

export const transferRoutes: FastifyPluginAsyncTypebox<TransferRoutesOptions> = async (
  app,
  { transferCash },
) => {
  app.post(
    '/users/:userId/transfers',
    {
      schema: {
        tags: ['transferencias'],
        summary: 'Registra un ingreso o un retiro de pesos',
        description:
          'Registra un movimiento ya confirmado por el sistema de transferencias, como una orden sobre ARS. ' +
          'Un retiro que supera los pesos disponibles responde 201 con `status: REJECTED` e `INSUFFICIENT_FUNDS`.',
        params: TransferParams,
        headers: IdempotencyHeaders,
        body: TransferBody,
        response: { 201: OrderResponse, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { order, replayed } = await transferCash.execute({
        userId,
        type: request.body.type,
        amount: Money.of(request.body.amount),
        correlationId: request.id,
        idempotency: idempotencyOf(
          request.headers['idempotency-key'],
          `${request.method} ${request.routeOptions.url}`,
          request.body,
        ),
      });

      request.log.info(
        {
          userId,
          orderId: order.id,
          side: order.side,
          status: order.status,
          rejectReason: order.rejectReason,
          replayed,
        },
        replayed ? 'reintento detectado: se devuelve la transferencia original' : 'transferencia registrada',
      );

      return reply.code(201).send(toOrderResponse(order));
    },
  );
};
