import type { Kysely } from 'kysely';
import type { PriceProvider } from '../../../../../application/ports/outbound/price-provider';
import type { MarketPrice } from '../../../../../domain/shared/market-price';
import type { DB } from '../../../../database/schema';
import { toMarketPrice } from '../mappers/instrument';

export class PostgresPriceProvider implements PriceProvider {
  constructor(private readonly db: Kysely<DB>) {}

  async latestPrices(instrumentIds: readonly number[]): Promise<Map<number, MarketPrice>> {
    const prices = new Map<number, MarketPrice>();
    if (instrumentIds.length === 0) return prices;

    const rows = await this.db
      .selectFrom('marketdata')
      .distinctOn('instrumentid')
      .select(['instrumentid', 'close', 'previousclose'])
      .where('instrumentid', 'in', [...instrumentIds])
      .orderBy('instrumentid')
      .orderBy('date', 'desc')
      .execute();

    for (const row of rows) {
      const price = toMarketPrice(row.close, row.previousclose);
      if (row.instrumentid !== null && price) prices.set(row.instrumentid, price);
    }
    return prices;
  }
}
