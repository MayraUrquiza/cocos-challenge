import { Money } from '../shared/money';
import type { OrderSide, RejectReason } from '../shared/order-values';
import { Quantity } from '../shared/quantity';
import { balances, type AccountBalances, type AccountState } from './account-state';

export interface OrderRequirement {
  instrumentId: number;
  size: Quantity;
  price: Money;
}

type SideCheck = (totals: AccountBalances, order: OrderRequirement) => RejectReason | null;

const enoughCash = (totals: AccountBalances, amount: Money): boolean =>
  !totals.availableCash.minus(amount).isNegative();

const enoughShares = (totals: AccountBalances, instrumentId: number, size: Quantity): boolean => {
  const available = totals.holdings.get(instrumentId)?.available ?? Quantity.zero(0);
  return !available.minus(size).isNegative();
};

const SIDE_CHECKS: Record<OrderSide, SideCheck> = {
  BUY: (totals, { size, price }) =>
    enoughCash(totals, price.times(size)) ? null : 'INSUFFICIENT_FUNDS',
  SELL: (totals, { instrumentId, size }) =>
    enoughShares(totals, instrumentId, size) ? null : 'INSUFFICIENT_HOLDINGS',
  CASH_IN: () => null,
  CASH_OUT: (totals, { size }) => (enoughCash(totals, Money.ofCash(size)) ? null : 'INSUFFICIENT_FUNDS'),
};

export const FinancialValidationService = {
  check(state: AccountState, side: OrderSide, order: OrderRequirement): RejectReason | null {
    return SIDE_CHECKS[side](balances(state), order);
  },
};
