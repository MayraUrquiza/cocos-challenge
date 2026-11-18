import type {
  InstrumentFinder,
  InstrumentMatch,
} from '../../../src/application/ports/outbound/instrument-finder';
import { SearchInstrumentsHandler } from '../../../src/application/use-cases/queries/search-instruments';
import { Money } from '../../../src/domain/shared/money';

const pamp: InstrumentMatch = {
  id: 47,
  ticker: 'PAMP',
  name: 'Pampa Holding S.A.',
  type: 'ACCIONES',
  price: { close: Money.of('925.85'), previousClose: Money.of('921.80') },
};

const pgr: InstrumentMatch = {
  id: 3,
  ticker: 'PGR',
  name: 'Phoenix Global Resources',
  type: 'ACCIONES',
  price: null,
};

function fakeSearch(items: InstrumentMatch[], total = items.length) {
  const search = jest.fn<ReturnType<InstrumentFinder['search']>, Parameters<InstrumentFinder['search']>>(
    async () => ({ items, total }),
  );
  return { search };
}

describe('SearchInstrumentsHandler', () => {
  it('pasa el texto y la paginación a la búsqueda', async () => {
    const instruments = fakeSearch([]);
    await new SearchInstrumentsHandler(instruments).execute({ text: 'pa', limit: 5, offset: 10 });

    expect(instruments.search).toHaveBeenCalledWith({ text: 'pa', limit: 5, offset: 10 });
  });

  it('agrega el último precio y el retorno diario de cada instrumento', async () => {
    const page = await new SearchInstrumentsHandler(fakeSearch([pamp])).execute({
      text: 'pamp',
      limit: 20,
      offset: 0,
    });

    expect(page.items[0]).toMatchObject({ id: 47, ticker: 'PAMP', type: 'ACCIONES' });
    expect(page.items[0]!.lastPrice?.toString()).toBe('925.85');
    expect(page.items[0]!.dailyReturn?.toString()).toBe('0.44');
  });

  it('un instrumento sin precios queda con precio y retorno nulos', async () => {
    const page = await new SearchInstrumentsHandler(fakeSearch([pgr])).execute({
      text: 'pgr',
      limit: 20,
      offset: 0,
    });

    expect(page.items[0]).toMatchObject({ ticker: 'PGR', lastPrice: null, dailyReturn: null });
  });

  it('devuelve el total y la paginación pedida', async () => {
    const page = await new SearchInstrumentsHandler(fakeSearch([pamp], 37)).execute({
      text: 'a',
      limit: 1,
      offset: 3,
    });

    expect(page).toMatchObject({ total: 37, limit: 1, offset: 3 });
  });
});
