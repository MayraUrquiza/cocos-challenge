import { Type, type Static } from 'typebox';
import {
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  REJECT_REASONS,
} from '../../../../../domain/shared/order-values';
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
