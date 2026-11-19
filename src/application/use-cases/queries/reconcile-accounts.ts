import { stateFrom } from '../../../domain/account/decider';
import { compareStates } from '../../../domain/account/reconciliation';
import type {
  AccountDifferences,
  ReconcileAccounts,
  ReconciliationReport,
} from '../../ports/inbound/reconcile-accounts';
import type { AccountEventsFinder } from '../../ports/outbound/account-events-finder';

export class ReconcileAccountsHandler implements ReconcileAccounts {
  constructor(private readonly events: AccountEventsFinder) {}

  async execute(): Promise<ReconciliationReport> {
    const accountIds = await this.events.accountIds();
    const accountsWithDifferences: AccountDifferences[] = [];

    for (const accountId of accountIds) {
      const { fromHistory, fromOrders } = await this.events.findEvents(accountId);
      const differences = compareStates(stateFrom(fromHistory), stateFrom(fromOrders));
      if (differences.length > 0) accountsWithDifferences.push({ accountId, differences });
    }

    return { accountsChecked: accountIds.length, accountsWithDifferences };
  }
}
