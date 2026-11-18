import type { Page } from '../../../../../application/shared/pagination';
import type { InstrumentSummary } from '../../../../../application/ports/inbound/search-instruments';
import type {
  InstrumentSummaryResponse,
  SearchInstrumentsResponse,
} from '../schemas/instruments';

export function toSearchInstrumentsResponse(
  page: Page<InstrumentSummary>,
): SearchInstrumentsResponse {
  return { ...page, items: page.items.map(toInstrumentSummaryResponse) };
}

function toInstrumentSummaryResponse(item: InstrumentSummary): InstrumentSummaryResponse {
  return {
    id: item.id,
    ticker: item.ticker,
    name: item.name,
    type: item.type,
    lastPrice: item.lastPrice?.toString() ?? null,
    dailyReturnPct: item.dailyReturn?.toString() ?? null,
  };
}
