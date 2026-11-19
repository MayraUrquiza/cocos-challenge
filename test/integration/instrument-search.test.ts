import type { Kysely } from 'kysely';
import { SearchInstrumentsHandler } from '../../src/application/use-cases/queries/search-instruments';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresInstrumentFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-instrument-finder';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

describe('GET /v1/instruments', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let app: App;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({
        searchInstruments: new SearchInstrumentsHandler(new PostgresInstrumentFinder(db)),
      }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await testDb?.drop();
  });

  const search = (query: string) => app.inject({ method: 'GET', url: `/v1/instruments?${query}` });
  const tickers = async (q: string) =>
    (await search(`q=${encodeURIComponent(q)}&limit=100`)).json().items.map((item: { ticker: string }) => item.ticker);

  it('responde el ejemplo de búsqueda del RFC, con el último precio y el retorno diario', async () => {
    const response = await search('q=bma');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: 31,
          ticker: 'BMA',
          name: 'Banco Macro S.A.',
          type: 'ACCIONES',
          lastPrice: '1502.80',
          dailyReturnPct: '-1.15',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it('"rio" encuentra "Molinos Río de la Plata" y "%" no devuelve todos los instrumentos', async () => {
    expect(await tickers('rio')).toContain('MOLI');
    expect(await tickers('%')).toEqual([]);
  });

  it('primero el ticker exacto, después los que empiezan con el texto y después el resto', async () => {
    expect(await tickers('moli')).toEqual(['MOLI', 'MOLA', 'SEMI']);
    expect((await tickers('pa')).slice(0, 2)).toEqual(['PAMP', 'PATA']);
  });

  it('nunca devuelve los pesos (ARS)', async () => {
    expect(await tickers('pesos')).toEqual([]);
  });

  it('un limit fuera de rango responde 400 (ADR-0005, punto 4)', async () => {
    const response = await search('q=a&limit=101');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ field: 'limit' }] });
  });
});
