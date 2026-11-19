import { decide, stateFrom } from '../../../../src/domain/account/decider';
import type { AccountCommand } from '../../../../src/domain/account/decision';
import { Money } from '../../../../src/domain/shared/money';
import { ARS, seedEvents } from '../../../support/seed-account';

function transfer(side: 'CASH_IN' | 'CASH_OUT', amount: string): AccountCommand {
  return { type: 'TransferCash', orderId: 12, side, amount: Money.of(amount), cashInstrumentId: ARS };
}

describe('decide: transferencias de pesos', () => {
  it('un ingreso se ejecuta siempre, como orden MARKET sobre ARS a precio 1 (ADR-0004, punto 5)', () => {
    const { event, order } = decide(stateFrom([]), transfer('CASH_IN', '200000.50'));

    expect(event).toEqual({ type: 'CashTransferredIn', orderId: 12, amount: Money.of('200000.50') });
    expect(order).toMatchObject({ instrumentId: ARS, side: 'CASH_IN', type: 'MARKET', status: 'FILLED' });
    expect(order.size?.toString()).toBe('200000.50');
    expect(order.price?.toString()).toBe('1.00');
  });

  it('un retiro que supera lo disponible se rechaza aunque no supere los pesos totales (ADR-0004, punto 1)', () => {
    // Usuario 1: 753.000 pesos, 627.500 disponibles. Los reservados no se pueden retirar.
    const user1 = stateFrom(seedEvents);

    expect(decide(user1, transfer('CASH_OUT', '627500')).order.status).toBe('FILLED');

    const { event, order } = decide(user1, transfer('CASH_OUT', '700000'));
    expect(event).toMatchObject({ type: 'OrderRejected', reason: 'INSUFFICIENT_FUNDS' });
    expect(order).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_FUNDS' });
  });
});
