import type { AccountEvent } from '../../../domain/account/events';
import type { Instrument } from '../../../domain/shared/instrument';

export interface PortfolioAccount {
  userId: number;
  accountNumber: string;
  events: AccountEvent[];
  instruments: Instrument[];
}

export interface PortfolioFinder {
  findAccount(userId: number): Promise<PortfolioAccount | null>;
}
