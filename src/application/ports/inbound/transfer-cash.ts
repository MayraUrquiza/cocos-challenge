import type { Money } from '../../../domain/shared/money';
import type { IdempotencyKey, RecordedOrder } from '../../shared/idempotency';

export interface TransferCashCommand {
  userId: number;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: Money;
  correlationId: string | null;
  idempotency: IdempotencyKey | null;
}

export interface TransferCash {
  execute(command: TransferCashCommand): Promise<RecordedOrder>;
}
