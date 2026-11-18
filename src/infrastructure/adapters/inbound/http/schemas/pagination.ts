import { Type, type TSchema } from 'typebox';

export const PaginationQuerystring = {
  limit: Type.Integer({ minimum: 1, maximum: 100, default: 20 }),
  offset: Type.Integer({ minimum: 0, default: 0 }),
};

export function PageSchema<T extends TSchema>(item: T) {
  return Type.Object(
    {
      items: Type.Array(item),
      total: Type.Integer({ minimum: 0 }),
      limit: Type.Integer({ minimum: 1 }),
      offset: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  );
}
