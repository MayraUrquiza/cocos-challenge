import type { Money } from '../shared/money';
import type { OrderType } from '../shared/order-values';

export interface PriceSources {
  marketPrice: Money | null;
  limitPrice: Money | null;
}

export interface TypeStrategy {
  price(sources: PriceSources): Money | null;
  accepted: 'FILLED' | 'NEW';
}

export const TYPE_STRATEGIES: Record<OrderType, TypeStrategy> = {
  MARKET: { price: ({ marketPrice }) => marketPrice, accepted: 'FILLED' },
  LIMIT: { price: ({ limitPrice }) => limitPrice, accepted: 'NEW' },
};
