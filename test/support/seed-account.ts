import { eventFromSnapshot, type AccountEvent } from '../../src/domain/account/events';
import type { OrderDetails, OrderSnapshot } from '../../src/domain/order/order';
import type { Instrument } from '../../src/domain/shared/instrument';
import type { MarketPrice } from '../../src/domain/shared/market-price';
import { Money } from '../../src/domain/shared/money';
import type { OrderSide, OrderStatus, OrderType } from '../../src/domain/shared/order-values';
import { Quantity } from '../../src/domain/shared/quantity';

export const ARS = 66;
export const PAMP = 47;
export const LOMA = 45;
export const BMA = 31;
export const METR = 54;

function snapshot(
  orderId: number,
  instrumentId: number,
  side: OrderSide,
  type: OrderType,
  size: string,
  price: string,
  status: OrderStatus,
): OrderSnapshot {
  return {
    orderId,
    instrumentId,
    side,
    type,
    size: Quantity.of(size, instrumentId === ARS ? 2 : 0),
    price: Money.of(price),
    status,
    rejectReason: null,
  };
}

/** Las 11 órdenes del usuario 1 en `database.sql`, en su estado final y en orden de (datetime, id). */
export const seedSnapshots: OrderSnapshot[] = [
  snapshot(1, ARS, 'CASH_IN', 'MARKET', '1000000', '1', 'FILLED'),
  snapshot(2, PAMP, 'BUY', 'MARKET', '50', '930', 'FILLED'),
  snapshot(3, PAMP, 'BUY', 'LIMIT', '50', '920', 'CANCELLED'),
  snapshot(4, PAMP, 'SELL', 'MARKET', '10', '940', 'FILLED'),
  snapshot(5, LOMA, 'BUY', 'LIMIT', '50', '710', 'NEW'),
  snapshot(6, PAMP, 'SELL', 'MARKET', '100', '950', 'REJECTED'),
  snapshot(7, BMA, 'BUY', 'LIMIT', '60', '1500', 'NEW'),
  snapshot(8, ARS, 'CASH_OUT', 'MARKET', '100000', '1', 'FILLED'),
  snapshot(9, BMA, 'BUY', 'LIMIT', '20', '1540', 'FILLED'),
  snapshot(10, METR, 'BUY', 'MARKET', '500', '250', 'FILLED'),
  snapshot(11, BMA, 'SELL', 'MARKET', '30', '1530', 'FILLED'),
];

/** Los eventos que arma el adaptador a partir del estado final de cada orden. */
export const seedEvents: AccountEvent[] = seedSnapshots
  .map(eventFromSnapshot)
  .filter((event) => event !== null);

function details(orderId: number): OrderDetails {
  const { size, price, ...rest } = seedSnapshots[orderId - 1]!;
  return { ...rest, size: size!, price: price! };
}

/**
 * La misma cuenta con su historia completa, como la habría registrado el
 * historial contable: la orden 3 se acepta y se cancela, la 9 se acepta y se ejecuta.
 */
export const seedHistory: AccountEvent[] = [
  { type: 'CashTransferredIn', orderId: 1, amount: Money.of('1000000') },
  { type: 'OrderFilled', order: details(2) },
  { type: 'OrderAccepted', order: details(3) },
  { type: 'OrderCancelled', orderId: 3 },
  { type: 'OrderFilled', order: details(4) },
  { type: 'OrderAccepted', order: details(5) },
  { type: 'OrderRejected', order: details(6), reason: 'INSUFFICIENT_HOLDINGS' },
  { type: 'OrderAccepted', order: details(7) },
  { type: 'CashTransferredOut', orderId: 8, amount: Money.of('100000') },
  { type: 'OrderAccepted', order: details(9) },
  { type: 'OrderFilled', order: details(9) },
  { type: 'OrderFilled', order: details(10) },
  { type: 'OrderFilled', order: details(11) },
];

export const seedInstruments = new Map<number, Instrument>([
  [PAMP, { id: PAMP, ticker: 'PAMP', name: 'Pampa Holding S.A.', type: 'ACCIONES' }],
  [LOMA, { id: LOMA, ticker: 'LOMA', name: 'Loma Negra S.A.', type: 'ACCIONES' }],
  [BMA, { id: BMA, ticker: 'BMA', name: 'Banco Macro S.A.', type: 'ACCIONES' }],
  [METR, { id: METR, ticker: 'METR', name: 'MetroGAS S.A.', type: 'ACCIONES' }],
  [ARS, { id: ARS, ticker: 'ARS', name: 'PESOS', type: 'MONEDA' }],
]);

const price = (close: string, previousClose: string): MarketPrice => ({
  close: Money.of(close),
  previousClose: Money.of(previousClose),
});

/** Precios del 14/07/2023. */
export const seedPrices = new Map<number, MarketPrice>([
  [PAMP, price('925.85', '921.80')],
  [LOMA, price('734.65', '734.35')],
  [BMA, price('1502.80', '1520.25')],
  [METR, price('229.50', '232.00')],
]);
