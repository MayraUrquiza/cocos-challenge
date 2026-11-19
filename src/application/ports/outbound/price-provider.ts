import type { MarketPrice } from '../../../domain/shared/market-price';

export interface PriceProvider {
  latestPrices(instrumentIds: readonly number[]): Promise<Map<number, MarketPrice>>;
}
