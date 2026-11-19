import type { Money } from '../shared/money';
import { balances, type AccountState } from './account-state';

export const FinancialValidationService = {
  hasAvailableCash(state: AccountState, amount: Money): boolean {
    return !balances(state).availableCash.minus(amount).isNegative();
  },
};
