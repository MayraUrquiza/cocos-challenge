import type { Kysely } from 'kysely';
import { SearchInstrumentsHandler } from '../../src/application/use-cases/queries/search-instruments';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { PostgresInstrumentFinder } from '../../src/infrastructure/adapters/outbound/postgres/finders/postgres-instrument-finder';
import { createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { stubUseCases } from '../support/use-cases';

describe('búsqueda de instrumentos contra PostgreSQL', () => {
  let testDb: TestDatabase;
  let db: Kysely<DB>;
  let search: PostgresInstrumentFinder;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = createDatabase(testDb.appUrl);
    search = new PostgresInstrumentFinder(db);
  });

  afterAll(async () => {
    await db?.destroy();
    await testDb?.drop();
  });

  async function tickers(text: string, limit = 100, offset = 0) {
    const { items } = await search.search({ text, limit, offset });
    return items.map((item) => item.ticker);
  }

  describe('coincidencia', () => {
    it('ignora tildes: "rio" encuentra "Molinos Río de la Plata"', async () => {
      expect(await tickers('rio')).toContain('MOLI');
    });

    it('ignora tildes también en el texto buscado', async () => {
      expect(await tickers('compañía')).toEqual(['INTR']);
      expect(await tickers('compania')).toEqual(['INTR']);
    });

    it('ignora mayúsculas', async () => {
      expect(await tickers('pAmPa')).toEqual(['PAMP']);
    });

    it('busca dentro del ticker', async () => {
      expect(await tickers('ECO2')).toEqual(['CECO2', 'TECO2']);
    });

    it.each(['%', '_', '\\'])('"%s" se busca como texto común, no como comodín', async (text) => {
      const { items, total } = await search.search({ text, limit: 100, offset: 0 });
      expect(items).toEqual([]);
      expect(total).toBe(0);
    });

    it('nunca devuelve los pesos (ARS)', async () => {
      expect(await tickers('ars')).not.toContain('ARS');
      expect(await tickers('pesos')).toEqual([]);
    });
  });

  describe('orden', () => {
    it('primero el ticker exacto, aunque otro venga antes alfabéticamente', async () => {
      expect(await tickers('moli')).toEqual(['MOLI', 'MOLA', 'SEMI']);
    });

    it('después los tickers que empiezan con el texto, y después el resto por ticker', async () => {
      const result = await tickers('pa');

      expect(result.slice(0, 2)).toEqual(['PAMP', 'PATA']);
      const rest = result.slice(2);
      expect(rest).toEqual([...rest].sort());
      expect(rest).toEqual(expect.arrayContaining(['BPAT', 'INTR']));
    });
  });

  describe('precios', () => {
    it('trae el último cierre y el anterior', async () => {
      const { items } = await search.search({ text: 'pamp', limit: 20, offset: 0 });

      expect(items[0]!.price?.close.toString()).toBe('925.85');
      expect(items[0]!.price?.previousClose?.toString()).toBe('921.80');
    });

    it('un instrumento sin precios cargados aparece igual, sin precio', async () => {
      const { items } = await search.search({ text: 'pgr', limit: 20, offset: 0 });

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ ticker: 'PGR', price: null });
    });
  });

  describe('paginación', () => {
    it('pagina en el mismo orden y el total no depende de la página', async () => {
      const all = await tickers('a');
      const { items, total } = await search.search({ text: 'a', limit: 5, offset: 5 });

      expect(total).toBe(all.length);
      expect(items.map((item) => item.ticker)).toEqual(all.slice(5, 10));
    });

    it('una página más allá del final viene vacía pero con el total', async () => {
      const { items, total } = await search.search({ text: 'pamp', limit: 20, offset: 100 });

      expect(items).toEqual([]);
      expect(total).toBe(1);
    });
  });

  it('GET /v1/instruments de punta a punta', async () => {
    const app: App = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({ searchInstruments: new SearchInstrumentsHandler(search) }),
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/v1/instruments?q=bma' });

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
    } finally {
      await app.close();
    }
  });
});
