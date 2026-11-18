import type { Money } from './money';
import { Percentage } from './percentage';

export interface MarketPrice {
  close: Money;
  previousClose: Money | null;
}

export function dailyReturn(price: MarketPrice): Percentage | null {
  if (!price.previousClose) return null;
  return Percentage.change(price.previousClose, price.close);
}
