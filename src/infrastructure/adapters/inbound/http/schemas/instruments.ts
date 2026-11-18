import { Type, type Static } from 'typebox';
import { PageSchema, PaginationQuerystring } from './pagination';

const DecimalString = (description: string) =>
  Type.String({ pattern: '^-?\\d+\\.\\d{2}$', description });

export const SearchInstrumentsQuerystring = Type.Object(
  {
    q: Type.String({
      minLength: 1,
      maxLength: 100,
      description: 'Texto a buscar en el ticker o el nombre. Ignora mayúsculas y tildes.',
    }),
    ...PaginationQuerystring,
  },
  { additionalProperties: false },
);

export type SearchInstrumentsQuerystring = Static<typeof SearchInstrumentsQuerystring>;

export const InstrumentSummaryResponse = Type.Object(
  {
    id: Type.Integer(),
    ticker: Type.String(),
    name: Type.String(),
    type: Type.Union([Type.Literal('ACCIONES'), Type.Literal('MONEDA')]),
    lastPrice: Type.Union([DecimalString('Último precio de cierre, en pesos'), Type.Null()]),
    dailyReturnPct: Type.Union([
      DecimalString('Variación del último cierre respecto del anterior, en %'),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);

export type InstrumentSummaryResponse = Static<typeof InstrumentSummaryResponse>;

export const SearchInstrumentsResponse = PageSchema(InstrumentSummaryResponse);

export type SearchInstrumentsResponse = Static<typeof SearchInstrumentsResponse>;
