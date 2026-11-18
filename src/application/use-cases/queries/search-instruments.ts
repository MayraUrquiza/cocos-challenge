import { dailyReturn } from '../../../domain/shared/market-price';
import type { Page } from '../../shared/pagination';
import type {
  InstrumentSummary,
  SearchInstruments,
  SearchInstrumentsQuery,
} from '../../ports/inbound/search-instruments';
import type { InstrumentFinder } from '../../ports/outbound/instrument-finder';

export class SearchInstrumentsHandler implements SearchInstruments {
  constructor(private readonly instrumentsFinder: InstrumentFinder) {}

  async execute(query: SearchInstrumentsQuery): Promise<Page<InstrumentSummary>> {
    const { items, total } = await this.instrumentsFinder.search(query);

    return {
      items: items.map(({ price, ...instrument }) => ({
        ...instrument,
        lastPrice: price?.close ?? null,
        dailyReturn: price ? dailyReturn(price) : null,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
