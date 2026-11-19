import type { InstrumentFinder } from '../../../src/application/ports/outbound/instrument-finder';
import { TransferCashHandler } from '../../../src/application/use-cases/commands/transfer-cash';
import { Money } from '../../../src/domain/shared/money';
import { InMemoryAccountRepository } from '../../support/in-memory-account-repository';
import { ARS, seedEvents } from '../../support/seed-account';

describe('TransferCashHandler', () => {
  const NOW = new Date('2026-11-19T10:00:00.000Z');
  const instruments: InstrumentFinder = {
    search: async () => ({ items: [], total: 0 }),
    findByTicker: async () => ({ id: ARS, ticker: 'ARS', name: 'PESOS', type: 'MONEDA' }),
    findById: async () => null,
  };

  it('registra cada pedido como una orden sobre ARS con su evento, validando contra lo disponible', async () => {
    const accounts = new InMemoryAccountRepository([1]).given(1, seedEvents);
    const handler = new TransferCashHandler(accounts, instruments, { now: () => NOW });

    // Usuario 1: 627.500 disponibles de 753.000.
    const rejected = await handler.execute({
      userId: 1,
      type: 'CASH_OUT',
      amount: Money.of('700000'),
      correlationId: 'req-1',
    });
    const filled = await handler.execute({
      userId: 1,
      type: 'CASH_OUT',
      amount: Money.of('627500'),
      correlationId: 'req-2',
    });

    expect(rejected).toMatchObject({ instrumentId: ARS, status: 'REJECTED', rejectReason: 'INSUFFICIENT_FUNDS' });
    expect(filled).toMatchObject({ instrumentId: ARS, status: 'FILLED', datetime: NOW });
    expect(accounts.recorded.map(({ event, metadata }) => [event.type, metadata.correlationId])).toEqual([
      ['OrderRejected', 'req-1'],
      ['CashTransferredOut', 'req-2'],
    ]);
  });
});
