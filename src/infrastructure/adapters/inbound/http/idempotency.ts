import { createHash } from 'node:crypto';
import { Type } from 'typebox';
import type { IdempotencyKey } from '../../../../application/shared/idempotency';

export const IdempotencyHeaders = Type.Object({
  'idempotency-key': Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 64,
      description:
        'Clave única por intención, generada por el cliente (se recomienda un UUID). ' +
        'Un reintento con la misma clave y el mismo body devuelve la orden original. ' +
        'Con otro body responde 409 IDEMPOTENCY_KEY_REUSED.',
    }),
  ),
});

/** JSON con las claves ordenadas: dos bodies iguales dan el mismo texto aunque cambie el orden. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * La clave del pedido, con el hash de la ruta y el body. La ruta entra en el
 * hash para que la misma clave usada en otra operación no pase por un reintento.
 */
export function idempotencyOf(
  key: string | undefined,
  route: string,
  body: unknown,
): IdempotencyKey | null {
  if (key === undefined) return null;
  const requestHash = createHash('sha256').update(`${route}\n${canonicalJson(body)}`).digest('hex');
  return { key, requestHash };
}
