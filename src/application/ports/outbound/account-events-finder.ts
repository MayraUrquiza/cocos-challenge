import type { AccountEvent } from '../../../domain/account/events';

export interface AccountEventSources {
  fromHistory: AccountEvent[];
  fromOrders: AccountEvent[];
}

export interface AccountEventsFinder {
  accountIds(): Promise<number[]>;
  findEvents(accountId: number): Promise<AccountEventSources>;
}
