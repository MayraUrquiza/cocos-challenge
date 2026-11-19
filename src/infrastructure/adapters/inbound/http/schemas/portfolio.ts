import { Type, type Static } from 'typebox';
import { POSITION_WARNINGS } from '../../../../../domain/portfolio/project-portfolio';

const Amount = (description: string) => Type.String({ description });
const NullableAmount = (description: string) => Type.Union([Amount(description), Type.Null()]);

export const PortfolioParams = Type.Object(
  { userId: Type.Integer({ minimum: 1, description: 'Número de usuario' }) },
  { additionalProperties: false },
);

const Warnings = Type.Array(Type.Enum(POSITION_WARNINGS));

export const PositionResponse = Type.Object(
  {
    instrumentId: Type.Integer(),
    ticker: Type.String(),
    name: Type.String(),
    quantity: Amount('Acciones. Negativa si los datos son inconsistentes (ver warnings).'),
    avgCostPrice: NullableAmount('Costo promedio de las acciones que se tienen. null con tenencia negativa.'),
    lastPrice: NullableAmount('Último precio de cierre. null sin precios cargados.'),
    marketValue: NullableAmount('Cantidad × último precio. null sin precios cargados.'),
    gain: NullableAmount('Valor de mercado − costo. null con tenencia negativa o sin precios.'),
    returnPct: NullableAmount('Rendimiento total en %, sobre el costo de lo que se tiene.'),
    dailyReturnPct: NullableAmount('Variación del último cierre respecto del anterior, en %.'),
    warnings: Warnings,
  },
  { additionalProperties: false },
);

export const PortfolioResponse = Type.Object(
  {
    userId: Type.Integer(),
    accountNumber: Type.String(),
    totalValue: Amount('Pesos (incluidos los reservados) + valor de mercado de las posiciones con precio.'),
    cash: Type.Object(
      {
        total: Amount('Todos los pesos del usuario.'),
        reserved: Amount('Pesos comprometidos en compras LIMIT pendientes.'),
        available: Amount('Pesos disponibles para operar: total − reservados.'),
      },
      { additionalProperties: false },
    ),
    warnings: Type.Array(Type.Enum(POSITION_WARNINGS), {
      description: 'Avisos de las posiciones. Con NO_MARKET_PRICE, totalValue está incompleto.',
    }),
    positions: Type.Array(PositionResponse),
  },
  { additionalProperties: false },
);

export type PortfolioResponse = Static<typeof PortfolioResponse>;
