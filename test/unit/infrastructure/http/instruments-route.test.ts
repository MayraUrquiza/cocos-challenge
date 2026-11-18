import type {
  SearchInstruments,
  SearchInstrumentsQuery,
} from '../../../../src/application/ports/inbound/search-instruments';
import { Money } from '../../../../src/domain/shared/money';
import { Percentage } from '../../../../src/domain/shared/percentage';
import { buildApp, type App } from '../../../../src/infrastructure/adapters/inbound/http/app';
import { stubUseCases } from '../../../support/use-cases';

describe('GET /v1/instruments', () => {
  let app: App;
  let received: SearchInstrumentsQuery[];

  beforeEach(async () => {
    received = [];
    const searchInstruments: SearchInstruments = {
      execute: async (query) => {
        received.push(query);
        return {
          items: [
            {
              id: 47,
              ticker: 'PAMP',
              name: 'Pampa Holding S.A.',
              type: 'ACCIONES',
              lastPrice: Money.of('925.85'),
              dailyReturn: Percentage.change(Money.of('921.80'), Money.of('925.85')),
            },
            {
              id: 3,
              ticker: 'PGR',
              name: 'Phoenix Global Resources',
              type: 'ACCIONES',
              lastPrice: null,
              dailyReturn: null,
            },
          ],
          total: 2,
          limit: query.limit,
          offset: query.offset,
        };
      },
    };
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({ searchInstruments }),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  function get(query: string) {
    return app.inject({ method: 'GET', url: `/v1/instruments${query}` });
  }

  it('responde la página con montos y porcentajes como texto', async () => {
    const response = await get('?q=pa');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: 47,
          ticker: 'PAMP',
          name: 'Pampa Holding S.A.',
          type: 'ACCIONES',
          lastPrice: '925.85',
          dailyReturnPct: '0.44',
        },
        {
          id: 3,
          ticker: 'PGR',
          name: 'Phoenix Global Resources',
          type: 'ACCIONES',
          lastPrice: null,
          dailyReturnPct: null,
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    });
  });

  it('usa limit 20 y offset 0 por defecto, y respeta los enviados', async () => {
    await get('?q=pa');
    await get('?q=pa&limit=5&offset=10');

    expect(received).toEqual([
      { text: 'pa', limit: 20, offset: 0 },
      { text: 'pa', limit: 5, offset: 10 },
    ]);
  });

  it.each([
    ['sin q', '', 'q', 'q es obligatorio'],
    ['q vacío', '?q=', 'q', 'q debe tener al menos 1 caracteres'],
    ['limit 0', '?q=a&limit=0', 'limit', 'limit debe ser mayor o igual que 1'],
    ['limit 101', '?q=a&limit=101', 'limit', 'limit debe ser menor o igual que 100'],
    ['offset negativo', '?q=a&offset=-1', 'offset', 'offset debe ser mayor o igual que 0'],
    ['limit no numérico', '?q=a&limit=diez', 'limit', 'limit debe ser de tipo entero'],
    ['parámetro desconocido', '?q=a&sort=name', 'sort', 'sort no es un campo permitido'],
  ])('%s responde 400 VALIDATION_ERROR', async (_case, query, field, message) => {
    const response = await get(query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field, message }],
    });
    expect(received).toEqual([]);
  });

  it('aparece en el OpenAPI', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.json().paths).toHaveProperty('/v1/instruments');
  });
});
