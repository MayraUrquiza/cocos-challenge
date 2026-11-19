import type { Money } from '../../../domain/shared/money';
import type { OrderView } from '../../shared/order-view';

export interface TransferCashCommand {
  userId: number;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: Money;
  correlationId: string | null;
}

export interface TransferCash {
  execute(command: TransferCashCommand): Promise<OrderView>;
}
