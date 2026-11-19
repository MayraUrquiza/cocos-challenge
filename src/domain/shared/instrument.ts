export type InstrumentType = 'ACCIONES' | 'MONEDA';

export const CASH_TICKER = 'ARS';

export interface Instrument {
  id: number;
  ticker: string;
  name: string;
  type: InstrumentType;
}
