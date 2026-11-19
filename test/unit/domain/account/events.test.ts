import { eventFromSnapshot } from '../../../../src/domain/account/events';
import type { OrderSnapshot } from '../../../../src/domain/order/order';
import { Money } from '../../../../src/domain/shared/money';
import { Quantity } from '../../../../src/domain/shared/quantity';

function snapshot(overrides: Partial<OrderSnapshot>): OrderSnapshot {
  return {
    orderId: 1,
    instrumentId: 47,
    side: 'BUY',
    type: 'LIMIT',
    size: Quantity.of('10', 0),
    price: Money.of('100'),
    status: 'FILLED',
    ...overrides,
  };
}

describe('eventFromSnapshot', () => {
  it('una compra o venta ejecutada equivale a OrderFilled, aunque haya sido LIMIT', () => {
    expect(eventFromSnapshot(snapshot({ side: 'BUY' }))?.type).toBe('OrderFilled');
    expect(eventFromSnapshot(snapshot({ side: 'SELL', type: 'MARKET' }))?.type).toBe('OrderFilled');
  });

  it('una orden pendiente equivale a OrderAccepted', () => {
    expect(eventFromSnapshot(snapshot({ status: 'NEW' }))?.type).toBe('OrderAccepted');
  });

  it('las transferencias ejecutadas usan size como monto', () => {
    const cash = { instrumentId: 66, type: 'MARKET' as const, size: Quantity.of('200000.5', 2), price: Money.of('1') };

    const cashIn = eventFromSnapshot(snapshot({ ...cash, side: 'CASH_IN' }));
    const cashOut = eventFromSnapshot(snapshot({ ...cash, side: 'CASH_OUT' }));

    expect(cashIn).toMatchObject({ type: 'CashTransferredIn', orderId: 1 });
    expect(cashOut).toMatchObject({ type: 'CashTransferredOut', orderId: 1 });
    expect(cashIn?.type === 'CashTransferredIn' && cashIn.amount.toString()).toBe('200000.50');
  });

  it('una orden rechazada o cancelada no afecta los saldos', () => {
    expect(eventFromSnapshot(snapshot({ status: 'REJECTED', size: null, price: null }))).toBeNull();
    expect(eventFromSnapshot(snapshot({ status: 'CANCELLED' }))).toBeNull();
  });

  it('una orden ejecutada sin precio es un dato roto', () => {
    expect(() => eventFromSnapshot(snapshot({ price: null }))).toThrow('no tiene cantidad o precio');
  });
});
