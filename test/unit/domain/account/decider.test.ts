import { balances } from '../../../../src/domain/account/account-state';
import { stateFrom } from '../../../../src/domain/account/decider';
import type { AccountEvent } from '../../../../src/domain/account/events';
import type { OrderDetails } from '../../../../src/domain/order/order';
import { Money } from '../../../../src/domain/shared/money';
import { Quantity } from '../../../../src/domain/shared/quantity';
import {
  BMA,
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
  it('con las 11 órdenes del usuario 1 da los saldos del RFC', () => {
    const totals = balances(stateFrom(seedEvents));

    expect(totals.cash.toString()).toBe('753000.00');
    expect(totals.reservedCash.toString()).toBe('125500.00');
    expect(totals.availableCash.toString()).toBe('627500.00');
    expect(totals.holdings.get(PAMP)?.quantity.toString()).toBe('40');
    expect(totals.holdings.get(METR)?.quantity.toString()).toBe('500');
    expect(totals.holdings.get(BMA)?.quantity.toString()).toBe('-10');
  });

  it('el historial completo, los estados finales y la carga legacy dan el mismo estado', () => {
    const legacy: AccountEvent[] = seedSnapshots.map((order) => ({ type: 'LegacyOrderImported', order }));

    expect(summary(seedHistory)).toEqual(summary(seedEvents));
    expect(summary(legacy)).toEqual(summary(seedEvents));
  });

  describe('reservas (ADR-0004, punto 1)', () => {
    it('cancelar una orden libera exactamente lo que apartaba ella', () => {
      const totals = balances(
        stateFrom([
          { type: 'OrderAccepted', order: limit(1, 'BUY', '10', '100') },
          { type: 'OrderAccepted', order: limit(2, 'BUY', '5', '200') },
          { type: 'OrderCancelled', orderId: 1 },
        ]),
      );

      expect(totals.reservedCash.toString()).toBe('1000.00');
    });

    it('ejecutar una orden pendiente convierte su reserva en el gasto real', () => {
      const buy = limit(1, 'BUY', '10', '100');
      const totals = balances(
        stateFrom([
          { type: 'CashTransferredIn', orderId: 9, amount: Money.of('5000') },
          { type: 'OrderAccepted', order: buy },
          { type: 'OrderFilled', order: buy },
        ]),
      );

      expect(totals.reservedCash.toString()).toBe('0.00');
      expect(totals.cash.toString()).toBe('4000.00');
      expect(totals.holdings.get(PAMP)?.quantity.toString()).toBe('10');
    });

    it('una ejecución sin aceptación previa no tiene nada que liberar', () => {
      const totals = balances(stateFrom([{ type: 'OrderFilled', order: limit(1, 'BUY', '10', '100') }]));

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

      expect(totals.holdings.get(PAMP)?.available.toString()).toBe('25');
      expect(totals.reservedCash.toString()).toBe('0.00');
    });
  });
});
