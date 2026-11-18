import { randomUUID } from 'node:crypto';
import type { FastifyInstance, RawRequestDefaultExpression } from 'fastify';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

const VALID_CORRELATION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Usa el x-correlation-id del cliente si es válido, si no genera uno.
 * Se valida para que un header arbitrario no termine escrito en los logs.
 */
export function genCorrelationId(request: RawRequestDefaultExpression): string {
  const header = request.headers[CORRELATION_ID_HEADER];
  if (typeof header === 'string' && VALID_CORRELATION_ID.test(header)) return header;
  return randomUUID();
}

/**
 * Una línea de log por request, con su duración (Métricas), y el
 * correlationId devuelto al cliente para que pueda reportarlo.
 */
export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime * 100) / 100,
      },
      'request completado',
    );
  });
}
