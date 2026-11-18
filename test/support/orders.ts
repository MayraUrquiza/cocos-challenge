import type { OrderView } from '../../src/application/shared/order-view';
import { Money } from '../../src/domain/shared/money';
import { Quantity } from '../../src/domain/shared/quantity';

/** Compra MARKET de 54 PAMP. */
export function anOrder(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: 12,
    userId: 1,
    instrumentId: 47,
    side: 'BUY',
    type: 'MARKET',
    size: Quantity.of('54', 0),
    price: Money.of('925.85'),
    status: 'FILLED',
    rejectReason: null,
    datetime: new Date('2026-11-17T14:02:11.000Z'),
    ...overrides,
  };
}
