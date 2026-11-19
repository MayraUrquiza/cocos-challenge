import type { TSchema } from 'typebox';

/** Una respuesta con la descripción que muestra el OpenAPI para su código de estado. */
export function described<T extends TSchema>(schema: T, description: string): T {
  return { ...schema, description };
}

export function errorResponse(description: string) {
  return { $ref: 'ErrorResponse#', description };
}

export const ValidationError = errorResponse(
  'Request inválido (`VALIDATION_ERROR`), con el problema de cada campo en `details`.',
);
