import type { AccountState } from '../../../domain/account/account-state';
import type { Decision } from '../../../domain/account/decision';
import type { OrderView } from '../../shared/order-view';

export interface AccountContext {
  state: AccountState;
  nextOrderId: number;
}

export interface RecordMetadata {
  occurredAt: Date;
  correlationId: string | null;
}

export interface AccountRepository {
  withAccount(
    userId: number,
    decide: (account: AccountContext) => Decision,
    metadata: RecordMetadata,
  ): Promise<OrderView>;
}
