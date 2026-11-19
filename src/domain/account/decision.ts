import type { OrderSnapshot } from '../order/order';
import type { PriceSources } from '../order/type-strategies';
import type { Money } from '../shared/money';
import type { OrderType } from '../shared/order-values';
import type { Quantity } from '../shared/quantity';
import type { AccountEvent } from './events';

export interface AccountTransferCashCommand {
  type: 'TransferCash';
  orderId: number;
  side: 'CASH_IN' | 'CASH_OUT';
  amount: Money;
  cashInstrumentId: number;
}

export interface AccountPlaceOrderCommand extends PriceSources {
  type: 'PlaceOrder';
  orderId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  orderType: OrderType;
  quantity: { size: Quantity } | { amount: Money };
}

export type AccountCommand = AccountTransferCashCommand | AccountPlaceOrderCommand;

export interface Decision {
  event: AccountEvent;
  order: OrderSnapshot;
}
