import type { FastifySchemaValidationError, SchemaErrorDataVar } from 'fastify/types/schema';
import type { ErrorDetail } from './error-response';

const TYPE_NAMES: Record<string, string> = {
  integer: 'entero',
  number: 'número',
  string: 'texto',
  boolean: 'booleano',
  object: 'objeto',
  array: 'lista',
  null: 'nulo',
};

/**
 * Traduce los errores de Ajv al formato `details` de la API (ADR-0001, punto 2):
 * un campo con su ruta (`price`, `items.0.size`) y un mensaje en castellano.
 */
export function formatValidationErrors(
  errors: FastifySchemaValidationError[],
  context: SchemaErrorDataVar | undefined,
): ErrorDetail[] {
  const details = errors.map((error) => toDetail(error, context));
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = `${detail.field}|${detail.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toDetail(
  error: FastifySchemaValidationError,
  context: SchemaErrorDataVar | undefined,
): ErrorDetail {
  const params = error.params as Record<string, unknown>;
  const base = error.instancePath
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  switch (error.keyword) {
    case 'required': {
      const field = fieldName([...base, String(params.missingProperty)], context);
      return { field, message: `${field} es obligatorio` };
    }
    case 'additionalProperties': {
      const field = fieldName([...base, String(params.additionalProperty)], context);
      return { field, message: `${field} no es un campo permitido` };
    }
    case 'exactlyOneOf': {
      const properties = params.properties as string[];
      const present = params.present as string[];
      const field = fieldName([...base, properties.at(-1)!], context);
      const options = properties.join(' o ');
      return {
        field,
        message: present.length > 1 ? `se debe enviar ${options}, no ambos` : `se debe enviar ${options}`,
      };
    }
    case 'discriminator': {
      const field = fieldName([...base, String(params.tag)], context);
      const message =
        params.tagValue === undefined ? `${field} es obligatorio` : `${field} no es un valor válido`;
      return { field, message };
    }
    default: {
      const field = fieldName(base, context);
      return { field, message: messageFor(error.keyword, field, params, error.message) };
    }
  }
}

function fieldName(path: string[], context: SchemaErrorDataVar | undefined): string {
  if (path.length > 0) return path.join('.');
  return context ?? 'request';
}

function messageFor(
  keyword: string,
  field: string,
  params: Record<string, unknown>,
  fallback: string | undefined,
): string {
  switch (keyword) {
    case 'type': {
      const types = String(params.type)
        .split(',')
        .map((type) => TYPE_NAMES[type] ?? type);
      return `${field} debe ser de tipo ${types.join(' o ')}`;
    }
    case 'minimum':
      return `${field} debe ser mayor o igual que ${String(params.limit)}`;
    case 'exclusiveMinimum':
      return `${field} debe ser mayor que ${String(params.limit)}`;
    case 'maximum':
      return `${field} debe ser menor o igual que ${String(params.limit)}`;
    case 'exclusiveMaximum':
      return `${field} debe ser menor que ${String(params.limit)}`;
    case 'minLength':
      return `${field} debe tener al menos ${String(params.limit)} caracteres`;
    case 'maxLength':
      return `${field} debe tener como máximo ${String(params.limit)} caracteres`;
    case 'enum':
      return `${field} debe ser uno de: ${(params.allowedValues as unknown[]).join(', ')}`;
    case 'const':
      return `${field} debe ser ${String(params.allowedValue)}`;
    case 'pattern':
      return `${field} no tiene el formato esperado`;
    case 'format':
      return `${field} debe tener formato ${String(params.format)}`;
    case 'maxDecimals':
      return `${field} debe tener como máximo ${String(params.limit)} decimales`;
    default:
      return fallback ? `${field} ${fallback}` : `${field} no es válido`;
  }
}
