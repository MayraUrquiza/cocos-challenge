import type { Instrument, InstrumentType } from '../../../../../domain/shared/instrument';
import type { MarketPrice } from '../../../../../domain/shared/market-price';
import { Money } from '../../../../../domain/shared/money';

const INSTRUMENT_TYPES: readonly InstrumentType[] = ['ACCIONES', 'MONEDA'];

interface InstrumentRow {
  id: number;
  ticker: string | null;
  name: string | null;
  type: string | null;
}

/**
 * Fila de `instruments` → dominio. Las columnas son opcionales en el esquema
 * provisto, pero un instrumento sin ticker, nombre o tipo es un dato roto:
 * falla en lugar de inventar un valor.
 */
export function toInstrument(row: InstrumentRow): Instrument {
  if (row.ticker === null || row.name === null) {
    throw new Error(`El instrumento ${row.id} no tiene ticker o nombre`);
  }
  if (!INSTRUMENT_TYPES.includes(row.type as InstrumentType)) {
    throw new Error(`El instrumento ${row.id} tiene un tipo desconocido: ${row.type}`);
  }
  return { id: row.id, ticker: row.ticker, name: row.name, type: row.type as InstrumentType };
}

/** `close` y `previousclose` de `marketdata` → dominio. Sin `close` no hay precio. */
export function toMarketPrice(close: string | null, previousClose: string | null): MarketPrice | null {
  if (close === null) return null;
  return {
    close: Money.of(close),
    previousClose: previousClose === null ? null : Money.of(previousClose),
  };
}
