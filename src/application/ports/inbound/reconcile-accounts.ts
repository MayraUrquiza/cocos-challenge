import type { StateDifference } from '../../../domain/account/reconciliation';

export interface AccountDifferences {
  accountId: number;
  differences: StateDifference[];
}

export interface ReconciliationReport {
  accountsChecked: number;
  accountsWithDifferences: AccountDifferences[];
}

export interface ReconcileAccounts {
  execute(): Promise<ReconciliationReport>;
}
