import type { OrderDetails } from '../order/order';
import { SIDE_STRATEGIES } from '../order/side-strategies';
import type { Money } from '../shared/money';
import type { Quantity } from '../shared/quantity';
import { EMPTY_ACCOUNT, type AccountState } from './account-state';
import { eventFromSnapshot, type AccountEvent } from './events';

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
