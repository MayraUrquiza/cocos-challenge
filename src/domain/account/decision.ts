import type { OrderSnapshot } from '../order/order';
import type { Money } from '../shared/money';
import type { AccountEvent } from './events';

export interface AccountTransferCashCommand {
  type: 'TransferCash';
  orderId: number;
  side: 'CASH_IN' | 'CASH_OUT';
  amount: Money;
  cashInstrumentId: number;
}

export type AccountCommand = AccountTransferCashCommand;

export interface Decision {
  event: AccountEvent;
  order: OrderSnapshot;
}
