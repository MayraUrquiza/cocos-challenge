import type { OrderDetails } from '../order/order';
import { SIDE_STRATEGIES } from '../order/side-strategies';
import { Money } from '../shared/money';
import { Quantity } from '../shared/quantity';

/**
 * Estado de una cuenta: lo mínimo para aplicar cualquier evento. Lo arma
 * `evolve` y lo usan el decider y el portfolio, así lo disponible que ve el
 * usuario es exactamente contra lo que se valida (ADR-0002, punto 3).
 */
export interface AccountState {
  /** Todos los pesos del usuario, incluidos los reservados. */
  cash: Money;
  /** Acciones por instrumento: compradas − vendidas. Pueden ser negativas si los datos son inconsistentes. */
  shares: ReadonlyMap<number, Quantity>;
  /** Órdenes LIMIT pendientes, por número: cada una sabe lo que aparta. */
  pending: ReadonlyMap<number, OrderDetails>;
}

export const EMPTY_ACCOUNT: AccountState = {
  cash: Money.zero(),
  shares: new Map(),
  pending: new Map(),
};

export interface Holding {
  quantity: Quantity;
  /** Acciones comprometidas en ventas LIMIT pendientes. */
  reserved: Quantity;
  /** Lo que se puede vender: tenencia − reservadas. */
  available: Quantity;
}

export interface AccountBalances {
  cash: Money;
  /** Pesos comprometidos en compras LIMIT pendientes. */
  reservedCash: Money;
  /** Lo que se puede gastar o retirar: pesos − reservados. */
  availableCash: Money;
  /** Por instrumento. Solo acciones: los pesos están en `cash`. */
  holdings: ReadonlyMap<number, Holding>;
}

/** Totales de la cuenta: pesos y acciones con lo reservado y lo disponible (ADR-0004, punto 1). */
export function balances(state: AccountState): AccountBalances {
  let reservedCash = Money.zero();
  const reservedShares = new Map<number, Quantity>();

  for (const order of state.pending.values()) {
    const effect = SIDE_STRATEGIES[order.side].reserved(order.size, order.price);
    reservedCash = reservedCash.plus(effect.cash);
    if (!effect.shares.isZero()) {
      const current = reservedShares.get(order.instrumentId) ?? Quantity.zero(0);
      reservedShares.set(order.instrumentId, current.plus(effect.shares));
    }
  }

  const holdings = new Map<number, Holding>();
  for (const instrumentId of new Set([...state.shares.keys(), ...reservedShares.keys()])) {
    const quantity = state.shares.get(instrumentId) ?? Quantity.zero(0);
    const reserved = reservedShares.get(instrumentId) ?? Quantity.zero(0);
    holdings.set(instrumentId, { quantity, reserved, available: quantity.minus(reserved) });
  }

  return {
    cash: state.cash,
    reservedCash,
    availableCash: state.cash.minus(reservedCash),
    holdings,
  };
}
