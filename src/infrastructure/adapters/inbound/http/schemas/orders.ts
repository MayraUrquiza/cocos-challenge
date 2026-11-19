import { Type, type Static } from 'typebox';
import {
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  REJECT_REASONS,
} from '../../../../../domain/shared/order-values';
import { Amount, MAX_PRICE } from './amounts';
import { PageSchema, PaginationQuerystring } from './pagination';

const Id = (description: string) => Type.Integer({ minimum: 1, description });

export const UserParams = Type.Object(
  { userId: Id('Número de usuario') },
  { additionalProperties: false },
);

export const UserOrderParams = Type.Object(
  { userId: Id('Número de usuario'), orderId: Id('Número de orden') },
  { additionalProperties: false },
);

export const ListOrdersQuerystring = Type.Object(
  { ...PaginationQuerystring },
  { additionalProperties: false },
);

export const OrderResponse = Type.Object(
  {
    id: Type.Integer(),
    userId: Type.Integer(),
    instrumentId: Type.Integer(),
    side: Type.Enum(ORDER_SIDES),
    type: Type.Enum(ORDER_TYPES),
    size: Type.Union([
      Type.String({ description: 'Acciones enteras, o pesos con 2 decimales en las transferencias' }),
      Type.Null(),
    ]),
    price: Type.Union([Type.String({ description: 'Precio en pesos, con 2 decimales' }), Type.Null()]),
    status: Type.Enum(ORDER_STATUSES),
    rejectReason: Type.Union([Type.Enum(REJECT_REASONS), Type.Null()]),
    datetime: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export type OrderResponse = Static<typeof OrderResponse>;

export const ListOrdersResponse = PageSchema(OrderResponse);

export type ListOrdersResponse = Static<typeof ListOrdersResponse>;

const orderFields = {
  instrumentId: Id('Instrumento a comprar o vender'),
  side: Type.Enum(['BUY', 'SELL'], { description: 'BUY compra, SELL vende.' }),
  size: Type.Optional(
    Type.Integer({
      exclusiveMinimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description: 'Cantidad de acciones. Exactamente uno entre size y amount.',
    }),
  ),
  amount: Type.Optional(
    Amount('Pesos a invertir: se compra la mayor cantidad de acciones enteras que alcance.'),
  ),
};

/** Se ejecuta al instante, al último precio: no acepta `price`. */
const MarketOrderBody = Type.Object(
  { ...orderFields, type: Type.Literal('MARKET') },
  { additionalProperties: false, exactlyOneOf: ['size', 'amount'] },
);

/** Queda pendiente hasta que se consiga el precio fijado. */
const LimitOrderBody = Type.Object(
  {
    ...orderFields,
    type: Type.Literal('LIMIT'),
    price: Type.Number({
      exclusiveMinimum: 0,
      maximum: MAX_PRICE,
      maxDecimals: 2,
      description: 'Precio límite en pesos, con hasta 2 decimales.',
    }),
  },
  { additionalProperties: false, exactlyOneOf: ['size', 'amount'] },
);

export type PlaceOrderBody = Static<typeof MarketOrderBody> | Static<typeof LimitOrderBody>;

/**
 * El tipo de orden decide qué rama se valida (ADR-0001, punto 2): una MARKET
 * con `price` o una LIMIT sin `price` responden 400 con el campo exacto, en
 * lugar de los errores de todas las ramas que daría un `oneOf` sin discriminador.
 */
export const PlaceOrderBody = Type.Unsafe<PlaceOrderBody>({
  type: 'object',
  required: ['type'],
  discriminator: { propertyName: 'type' },
  oneOf: [MarketOrderBody, LimitOrderBody],
  examples: [
    { instrumentId: 47, side: 'BUY', type: 'MARKET', amount: 50000 },
    { instrumentId: 47, side: 'BUY', type: 'LIMIT', size: 10, price: 900 },
    { instrumentId: 47, side: 'SELL', type: 'MARKET', size: 5 },
  ],
});
