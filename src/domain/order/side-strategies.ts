import { Money } from '../shared/money';
import type { OrderSide } from '../shared/order-values';
import { Quantity } from '../shared/quantity';

export interface BalanceEffect {
  cash: Money;
  shares: Quantity;
}

export interface SideStrategy {
  filled(size: Quantity, price: Money): BalanceEffect;
  reserved(size: Quantity, price: Money): BalanceEffect;
}

const noShares = () => Quantity.zero(0);
const NONE = (): BalanceEffect => ({ cash: Money.zero(), shares: noShares() });

export const SIDE_STRATEGIES: Record<OrderSide, SideStrategy> = {
  BUY: {
    filled: (size, price) => ({ cash: price.times(size).negated(), shares: size }),
    reserved: (size, price) => ({ cash: price.times(size), shares: noShares() }),
  },

  SELL: {
    filled: (size, price) => ({ cash: price.times(size), shares: size.negated() }),
    reserved: (size) => ({ cash: Money.zero(), shares: size }),
  },

  CASH_IN: {
    filled: (size) => ({ cash: Money.ofCash(size), shares: noShares() }),
    reserved: NONE,
  },

  CASH_OUT: {
    filled: (size) => ({ cash: Money.ofCash(size).negated(), shares: noShares() }),
    reserved: NONE,
  },
};
