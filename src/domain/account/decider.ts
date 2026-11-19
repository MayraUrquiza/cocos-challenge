import type { OrderDetails } from '../order/order';
import { SIDE_STRATEGIES } from '../order/side-strategies';
import { Money } from '../shared/money';
import { Quantity } from '../shared/quantity';
import { EMPTY_ACCOUNT, type AccountState } from './account-state';
import type { AccountCommand, AccountTransferCashCommand, Decision } from './decision';
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
  const filled = (event: AccountEvent): Decision => ({
    event,
    order: { ...order, status: 'FILLED', rejectReason: null },
  });

  if (command.side === 'CASH_IN') {
    return filled({ type: 'CashTransferredIn', orderId: order.orderId, amount: command.amount });
  }

  if (FinancialValidationService.hasAvailableCash(state, command.amount)) {
    return filled({ type: 'CashTransferredOut', orderId: order.orderId, amount: command.amount });
  }

  return {
    event: { type: 'OrderRejected', order, reason: 'INSUFFICIENT_FUNDS' },
    order: { ...order, status: 'REJECTED', rejectReason: 'INSUFFICIENT_FUNDS' },
  };
}

export function decide(state: AccountState, command: AccountCommand): Decision {
  switch (command.type) {
    case 'TransferCash':
      return transferCash(state, command);
  }
}
