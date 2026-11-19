import { balances, EMPTY_ACCOUNT } from '../../../../src/domain/account/account-state';
import { evolve, stateFrom } from '../../../../src/domain/account/decider';
import type { AccountEvent } from '../../../../src/domain/account/events';
import type { OrderDetails } from '../../../../src/domain/order/order';
import { Money } from '../../../../src/domain/shared/money';
import { Quantity } from '../../../../src/domain/shared/quantity';
import {
  BMA,
  LOMA,
  METR,
  PAMP,
  seedEvents,
  seedHistory,
  seedSnapshots,
} from '../../../support/seed-account';

function limit(orderId: number, side: 'BUY' | 'SELL', size: string, price: string): OrderDetails {
  return {
    orderId,
    instrumentId: PAMP,
    side,
    type: 'LIMIT',
    size: Quantity.of(size, 0),
    price: Money.of(price),
  };
}

function summary(events: readonly AccountEvent[]) {
  const state = stateFrom(events);
  const totals = balances(state);
  return {
    cash: totals.cash.toString(),
    reservedCash: totals.reservedCash.toString(),
    holdings: Object.fromEntries(
      [...totals.holdings].map(([id, holding]) => [
        id,
        [holding.quantity.toString(), holding.reserved.toString()],
      ]),
    ),
    pending: [...state.pending.keys()].sort((a, b) => a - b),
  };
}

describe('evolve', () => {
  describe('con las 11 órdenes del usuario 1', () => {
    const totals = balances(stateFrom(seedEvents));

    it('calcula los pesos, los reservados y los disponibles del RFC', () => {
      expect(totals.cash.toString()).toBe('753000.00');
      expect(totals.reservedCash.toString()).toBe('125500.00');
      expect(totals.availableCash.toString()).toBe('627500.00');
    });

    it('calcula las tenencias, incluida la negativa de BMA', () => {
      expect(totals.holdings.get(PAMP)?.quantity.toString()).toBe('40');
      expect(totals.holdings.get(METR)?.quantity.toString()).toBe('500');
      expect(totals.holdings.get(BMA)?.quantity.toString()).toBe('-10');
    });

    it('una compra pendiente reserva pesos pero no crea tenencia', () => {
      expect(totals.holdings.has(LOMA)).toBe(false);
    });
  });

  it('el historial completo y los estados finales de las órdenes dan el mismo estado', () => {
    expect(summary(seedHistory)).toEqual(summary(seedEvents));
  });

  it('cargar las órdenes como LegacyOrderImported da el mismo estado', () => {
    const legacy: AccountEvent[] = seedSnapshots.map((order) => ({
      type: 'LegacyOrderImported',
      order,
    }));

    expect(summary(legacy)).toEqual(summary(seedEvents));
  });

  describe('reservas', () => {
    const buyA = limit(1, 'BUY', '10', '100');
    const buyB = limit(2, 'BUY', '5', '200');

    it('cancelar una orden libera exactamente lo que apartaba ella', () => {
      const totals = balances(
        stateFrom([
          { type: 'OrderAccepted', order: buyA },
          { type: 'OrderAccepted', order: buyB },
          { type: 'OrderCancelled', orderId: 1 },
        ]),
      );

      expect(totals.reservedCash.toString()).toBe('1000.00');
    });

    it('ejecutar una orden pendiente convierte su reserva en el gasto real', () => {
      const totals = balances(
        stateFrom([
          { type: 'CashTransferredIn', orderId: 9, amount: Money.of('5000') },
          { type: 'OrderAccepted', order: buyA },
          { type: 'OrderFilled', order: buyA },
        ]),
      );

      expect(totals.reservedCash.toString()).toBe('0.00');
      expect(totals.cash.toString()).toBe('4000.00');
      expect(totals.holdings.get(PAMP)?.quantity.toString()).toBe('10');
    });

    it('una ejecución sin aceptación previa no tiene nada que liberar', () => {
      const totals = balances(stateFrom([{ type: 'OrderFilled', order: buyA }]));

      expect(totals.reservedCash.toString()).toBe('0.00');
      expect(totals.cash.toString()).toBe('-1000.00');
    });

    it('una venta LIMIT pendiente reserva acciones', () => {
      const totals = balances(
        stateFrom([
          { type: 'OrderFilled', order: limit(1, 'BUY', '40', '900') },
          { type: 'OrderAccepted', order: limit(2, 'SELL', '15', '950') },
        ]),
      );

      const pamp = totals.holdings.get(PAMP)!;
      expect(pamp.quantity.toString()).toBe('40');
      expect(pamp.reserved.toString()).toBe('15');
      expect(pamp.available.toString()).toBe('25');
      expect(totals.reservedCash.toString()).toBe('0.00');
    });

    it('cancelar una orden que no está pendiente no cambia nada', () => {
      const before = stateFrom([{ type: 'OrderAccepted', order: buyA }]);
      expect(evolve(before, { type: 'OrderCancelled', orderId: 99 })).toBe(before);
    });
  });

  it('un rechazo no mueve saldos', () => {
    const state = evolve(EMPTY_ACCOUNT, {
      type: 'OrderRejected',
      order: { ...limit(1, 'BUY', '10', '100'), size: null, price: null },
      reason: 'NO_MARKET_PRICE',
    });

    expect(state).toBe(EMPTY_ACCOUNT);
  });

  it('las transferencias mueven pesos sin crear tenencias', () => {
    const totals = balances(
      stateFrom([
        { type: 'CashTransferredIn', orderId: 1, amount: Money.of('200000.50') },
        { type: 'CashTransferredOut', orderId: 2, amount: Money.of('0.50') },
      ]),
    );

    expect(totals.cash.toString()).toBe('200000.00');
    expect(totals.holdings.size).toBe(0);
  });

  it('no modifica el estado que recibe', () => {
    const before = stateFrom([{ type: 'OrderAccepted', order: limit(1, 'BUY', '10', '100') }]);
    evolve(before, { type: 'OrderFilled', order: limit(1, 'BUY', '10', '100') });

    expect(before.pending.has(1)).toBe(true);
    expect(before.shares.size).toBe(0);
  });

  it('una cuenta sin eventos está en cero', () => {
    const totals = balances(stateFrom([]));

    expect(totals.cash.toString()).toBe('0.00');
    expect(totals.availableCash.toString()).toBe('0.00');
    expect(totals.holdings.size).toBe(0);
  });
});
