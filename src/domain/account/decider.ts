import type { OrderDetails } from '../order/order';
import { SIDE_STRATEGIES } from '../order/side-strategies';
import { InvalidTransitionError, transition } from '../order/state-machine';
import { TYPE_STRATEGIES } from '../order/type-strategies';
import { Money } from '../shared/money';
import type { RejectReason } from '../shared/order-values';
import { Quantity } from '../shared/quantity';
import { EMPTY_ACCOUNT, type AccountState } from './account-state';
import type {
  AccountCancelOrderCommand,
  AccountCommand,
  AccountFillOrderCommand,
  AccountPlaceOrderCommand,
  AccountTransferCashCommand,
  Decision,
} from './decision';
import { eventFromSnapshot, type AccountEvent } from './events';
import { FinancialValidationService } from './financial-validation';

function withShares(state: AccountState, instrumentId: number, delta: Quantity): AccountState {
  if (delta.isZero()) return state;
  const shares = new Map(state.shares);
  const current = shares.get(instrumentId);
  shares.set(instrumentId, current ? current.plus(delta) : delta);
  return { ...state, shares };
}

function withCash(state: AccountState, delta: Money): AccountState {
  return { ...state, cash: state.cash.plus(delta) };
}

function withoutPending(state: AccountState, orderId: number): AccountState {
  if (!state.pending.has(orderId)) return state;
  const pending = new Map(state.pending);
  pending.delete(orderId);
  return { ...state, pending };
}

function fill(state: AccountState, order: OrderDetails): AccountState {
  const effect = SIDE_STRATEGIES[order.side].filled(order.size, order.price);
  // Si la orden estaba pendiente, su reserva se convierte en el movimiento real.
  // Si no (una MARKET, o una LIMIT cuya aceptación no está en los eventos), no hay nada que liberar.
  const released = withoutPending(state, order.orderId);
  return withShares(withCash(released, effect.cash), order.instrumentId, effect.shares);
}

/**
 * Aplica un evento al estado de la cuenta (ADR-0002, punto 3). Es la única
 * definición de cómo cambia una cuenta: aplicando en orden los eventos de una
 * cuenta se obtiene su estado, vengan del historial contable o del estado
 * actual de las órdenes.
 */
export function evolve(state: AccountState, event: AccountEvent): AccountState {
  switch (event.type) {
    case 'OrderAccepted': {
      const pending = new Map(state.pending);
      pending.set(event.order.orderId, event.order);
      return { ...state, pending };
    }
    case 'OrderFilled':
      return fill(state, event.order);
    case 'OrderCancelled':
      return withoutPending(state, event.orderId);
    case 'OrderRejected':
      return state;
    case 'CashTransferredIn':
      return withCash(state, event.amount);
    case 'CashTransferredOut':
      return withCash(state, event.amount.negated());
    case 'LegacyOrderImported': {
      const equivalent = eventFromSnapshot(event.order);
      return equivalent ? evolve(state, equivalent) : state;
    }
  }
}

/** El estado que resulta de aplicar los eventos en orden, desde una cuenta vacía. */
export function stateFrom(events: readonly AccountEvent[]): AccountState {
  return events.reduce(evolve, EMPTY_ACCOUNT);
}

/** Las transferencias se guardan como órdenes MARKET sobre `ARS`, a precio 1 (ADR-0004, punto 5). */
const CASH_PRICE = Money.of(1);

function transferCash(state: AccountState, command: AccountTransferCashCommand): Decision {
  if (command.amount.isZero() || command.amount.isNegative()) {
    throw new RangeError(`El monto de una transferencia tiene que ser mayor que 0: ${command.amount.toString()}`);
  }

  const order: OrderDetails = {
    orderId: command.orderId,
    instrumentId: command.cashInstrumentId,
    side: command.side,
    type: 'MARKET',
    size: Quantity.of(command.amount.toString(), 2),
    price: CASH_PRICE,
  };
  const reason = FinancialValidationService.check(state, command.side, order);
  if (reason) {
    return {
      kind: 'create',
      event: { type: 'OrderRejected', order, reason },
      order: { ...order, status: 'REJECTED', rejectReason: reason },
    };
  }

  const event: AccountEvent =
    command.side === 'CASH_IN'
      ? { type: 'CashTransferredIn', orderId: order.orderId, amount: command.amount }
      : { type: 'CashTransferredOut', orderId: order.orderId, amount: command.amount };
  return { kind: 'create', event, order: { ...order, status: 'FILLED', rejectReason: null } };
}

/** La mayor cantidad de acciones enteras que se compran con un monto (ADR-0004, punto 4). */
function wholeSharesFor(amount: Money, price: Money): Quantity {
  return Quantity.of(amount.toDecimal().dividedToIntegerBy(price.toDecimal()).toFixed(0), 0);
}

function placeOrder(state: AccountState, command: AccountPlaceOrderCommand): Decision {
  const { quantity } = command;
  const requested = 'amount' in quantity ? { requestedAmount: quantity.amount } : {};
  const base = {
    orderId: command.orderId,
    instrumentId: command.instrumentId,
    side: command.side,
    type: command.orderType,
  };

  // Una orden rechazada guarda lo que se llegó a resolver: null si no existe (ADR-0004, punto 4).
  const reject = (reason: RejectReason, size: Quantity | null, price: Money | null): Decision => ({
    kind: 'create',
    event: { type: 'OrderRejected', order: { ...base, size, price }, reason, ...requested },
    order: { ...base, size, price, status: 'REJECTED', rejectReason: reason },
  });

  const strategy = TYPE_STRATEGIES[command.orderType];
  const price = strategy.price(command);
  if (!price) return reject('NO_MARKET_PRICE', 'size' in quantity ? quantity.size : null, null);

  const size = 'size' in quantity ? quantity.size : wholeSharesFor(quantity.amount, price);
  if (size.isZero()) return reject('ZERO_QUANTITY', size, price);

  const reason = FinancialValidationService.check(state, command.side, {
    instrumentId: command.instrumentId,
    size,
    price,
  });
  if (reason) return reject(reason, size, price);

  // Una MARKET queda ejecutada, una LIMIT pendiente.
  const order: OrderDetails = { ...base, size, price };
  const event: AccountEvent =
    strategy.accepted === 'FILLED'
      ? { type: 'OrderFilled', order, ...requested }
      : { type: 'OrderAccepted', order, ...requested };
  return { kind: 'create', event, order: { ...order, status: strategy.accepted, rejectReason: null } };
}

function cancelOrder(state: AccountState, command: AccountCancelOrderCommand): Decision {
  if (!state.pending.has(command.orderId)) {
    throw new InvalidTransitionError(command.orderId, 'NOT_PENDING', 'CANCELLED');
  }
  return {
    kind: 'transition',
    event: { type: 'OrderCancelled', orderId: command.orderId },
    orderId: command.orderId,
    from: 'NEW',
    to: transition(command.orderId, 'NEW', 'CANCELLED'),
  };
}

function fillOrder(state: AccountState, command: AccountFillOrderCommand): Decision {
  const order = state.pending.get(command.orderId);
  if (!order) throw new InvalidTransitionError(command.orderId, 'NOT_PENDING', 'FILLED');
  return {
    kind: 'transition',
    event: { type: 'OrderFilled', order },
    orderId: command.orderId,
    from: 'NEW',
    to: transition(command.orderId, 'NEW', 'FILLED'),
  };
}

export function decide(state: AccountState, command: AccountCommand): Decision {
  switch (command.type) {
    case 'TransferCash':
      return transferCash(state, command);
    case 'PlaceOrder':
      return placeOrder(state, command);
    case 'CancelOrder':
      return cancelOrder(state, command);
    case 'FillOrder':
      return fillOrder(state, command);
  }
}
