import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import {
  ApplicationError,
  type ApplicationErrorCode,
} from '../../../../../application/shared/errors';
import type { ErrorCode, ErrorDetail, ErrorResponse } from './error-response';
import { formatValidationErrors } from './validation-error-formatter';

const STATUS_BY_APPLICATION_CODE: Record<ApplicationErrorCode, number> = {
  USER_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
};

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/**
 * Lleva todo error al formato único de la API (ADR-0005, punto 3).
 * Un 500 nunca expone detalles internos: van al log con el correlationId.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ApplicationError, request, reply) => {
    if (error instanceof ApplicationError) {
      return sendError(reply, STATUS_BY_APPLICATION_CODE[error.code], error.code, error.message);
    }

    if (error.validation) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'El request no es válido', {
        details: formatValidationErrors(error.validation, error.validationContext),
      });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'error inesperado');
      return sendError(reply, 500, 'INTERNAL_ERROR', 'Error interno del servidor');
    }

    request.log.info({ err: error }, 'request rechazado por el framework');
    return sendError(
      reply,
      statusCode,
      CODE_BY_STATUS[statusCode] ?? 'REQUEST_ERROR',
      error.message,
    );
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(reply, 404, 'NOT_FOUND', `La ruta ${request.method} ${request.url} no existe`),
  );
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ErrorCode,
  message: string,
  extra: { details?: ErrorDetail[] } = {},
): FastifyReply {
  const body: ErrorResponse = {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    code,
    message,
    ...(extra.details ? { details: extra.details } : {}),
  };
  return reply.code(statusCode).type('application/json').send(body);
}
