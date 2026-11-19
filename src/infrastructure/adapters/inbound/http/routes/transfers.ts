import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { TransferCash } from '../../../../../application/ports/inbound/transfer-cash';
import { Money } from '../../../../../domain/shared/money';
import { IdempotencyHeaders, idempotencyOf } from '../idempotency';
import { toOrderResponse } from '../mappers/order-response';
import { OrderResponse } from '../schemas/orders';
import { described, errorResponse, ValidationError } from '../schemas/responses';
import { TransferBody, TransferParams } from '../schemas/transfers';

export interface TransferRoutesOptions {
  transferCash: TransferCash;
}

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
        response: {
          201: described(
            OrderResponse,
            'Transferencia registrada como orden sobre ARS: `FILLED`, o `REJECTED` con `INSUFFICIENT_FUNDS`. ' +
              'Un reintento con la misma `Idempotency-Key` devuelve la original.',
          ),
          400: ValidationError,
          404: errorResponse('`USER_NOT_FOUND`: el usuario no existe.'),
          409: errorResponse('`IDEMPOTENCY_KEY_REUSED`: la clave ya se usó con otro body.'),
        },
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
