import { Type, type Static } from 'typebox';
import type { ApplicationErrorCode } from '../../../../../application/shared/errors';

export type ErrorCode =
  | ApplicationErrorCode
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'REQUEST_ERROR'
  | 'INTERNAL_ERROR';

export const ErrorDetailSchema = Type.Object(
  {
    field: Type.String(),
    message: Type.String(),
  },
  { additionalProperties: false },
);

export type ErrorDetail = Static<typeof ErrorDetailSchema>;

/** Forma única de todos los errores. Extiende la de Fastify. */
export const ErrorResponseSchema = Type.Object(
  {
    statusCode: Type.Integer(),
    error: Type.String(),
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.Array(ErrorDetailSchema)),
  },
  { $id: 'ErrorResponse', additionalProperties: false },
);

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
