import { Type } from 'typebox';

/**
 * Hasta 999.999.999.999,99: un número JSON se lee como double, y por encima de
 * ese orden los centavos dejan de ser exactos (ADR-0005, punto 4).
 */
export const MAX_AMOUNT = 999_999_999_999.99;

/** Lo que entra en `orders.price`, `NUMERIC(10, 2)` (ADR-0005, punto 4). */
export const MAX_PRICE = 99_999_999.99;

/** Un monto en pesos: mayor que 0 y con hasta 2 decimales. */
export const Amount = (description: string) =>
  Type.Number({ exclusiveMinimum: 0, maximum: MAX_AMOUNT, maxDecimals: 2, description });
