import { Type, type Static } from 'typebox';
import { Amount } from './amounts';

export const TransferParams = Type.Object(
  { userId: Type.Integer({ minimum: 1, description: 'Número de usuario' }) },
  { additionalProperties: false },
);

export const TransferBody = Type.Object(
  {
    type: Type.Enum(['CASH_IN', 'CASH_OUT'], {
      description: 'CASH_IN ingresa pesos, CASH_OUT los retira.',
    }),
    amount: Amount('Monto en pesos, mayor que 0 y con hasta 2 decimales.'),
  },
  {
    additionalProperties: false,
    examples: [
      { type: 'CASH_IN', amount: 200000.5 },
      { type: 'CASH_OUT', amount: 15000 },
    ],
  },
);

export type TransferBody = Static<typeof TransferBody>;
