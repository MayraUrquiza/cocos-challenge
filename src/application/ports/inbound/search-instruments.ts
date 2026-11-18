import type { Instrument } from '../../../domain/shared/instrument';
import type { Money } from '../../../domain/shared/money';
import type { Percentage } from '../../../domain/shared/percentage';
import type { Page, PageRequest } from '../../shared/pagination';

export interface SearchInstrumentsQuery extends PageRequest {
  /** Texto a buscar dentro del ticker o del nombre. */
  text: string;
}

export interface InstrumentSummary extends Instrument {
  lastPrice: Money | null;
  dailyReturn: Percentage | null;
}

export interface SearchInstruments {
  execute(query: SearchInstrumentsQuery): Promise<Page<InstrumentSummary>>;
}
