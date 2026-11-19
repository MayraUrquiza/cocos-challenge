import type { OrderSnapshot } from '../order/order';
import type { PriceSources } from '../order/type-strategies';
import type { Money } from '../shared/money';
import type { OrderStatus, OrderType } from '../shared/order-values';
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

export interface AccountCancelOrderCommand {
  type: 'CancelOrder';
  orderId: number;
}

export type AccountCommand =
  | AccountTransferCashCommand
  | AccountPlaceOrderCommand
  | AccountCancelOrderCommand;

export type Decision =
  | { kind: 'create'; event: AccountEvent; order: OrderSnapshot }
  | {
      kind: 'transition';
      event: AccountEvent;
      orderId: number;
      from: OrderStatus;
      to: OrderStatus;
    };
