import { Type, type Static } from 'typebox';

/**
 * Hasta 999.999.999.999,99: un número JSON se lee como double, y por encima de
 * ese orden los centavos dejan de ser exactos.
 */
export const MAX_AMOUNT = 999_999_999_999.99;

export const TransferParams = Type.Object(
  { userId: Type.Integer({ minimum: 1, description: 'Número de usuario' }) },
  { additionalProperties: false },
);

export const TransferBody = Type.Object(
  {
    type: Type.Enum(['CASH_IN', 'CASH_OUT'], {
      description: 'CASH_IN ingresa pesos, CASH_OUT los retira.',
    }),
    amount: Type.Number({
      exclusiveMinimum: 0,
      maximum: MAX_AMOUNT,
      maxDecimals: 2,
      description: 'Monto en pesos, mayor que 0 y con hasta 2 decimales.',
    }),
  },
  { additionalProperties: false },
);

export type TransferBody = Static<typeof TransferBody>;
