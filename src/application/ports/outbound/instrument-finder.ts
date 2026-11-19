import type { Instrument } from '../../../domain/shared/instrument';
import type { MarketPrice } from '../../../domain/shared/market-price';
import type { PageRequest } from '../../shared/pagination';

export interface InstrumentMatch extends Instrument {
  price: MarketPrice | null;
}

/**
 * Lectura a medida para la búsqueda. Resuelve la coincidencia, el orden y la
 * paginación: ticker exacto, después tickers que empiezan con el texto y
 * después el resto, por ticker. Excluye los instrumentos no operables (`ARS`).
 */
export interface InstrumentFinder {
  search(query: { text: string } & PageRequest): Promise<{ items: InstrumentMatch[]; total: number }>;
  findByTicker(ticker: string): Promise<Instrument | null>;
  findById(instrumentId: number): Promise<Instrument | null>;
}
