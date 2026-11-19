import type { AccountState } from '../../../domain/account/account-state';
import type { Decision } from '../../../domain/account/decision';
import type { IdempotencyKey, RecordedOrder } from '../../shared/idempotency';

export interface AccountContext {
  state: AccountState;
  nextOrderId: number;
}

export interface RecordMetadata {
  occurredAt: Date;
  correlationId: string | null;
  idempotency: IdempotencyKey | null;
}

export interface AccountRepository {
  withAccount(
    userId: number,
    decide: (account: AccountContext) => Decision,
    metadata: RecordMetadata,
  ): Promise<RecordedOrder>;
}
