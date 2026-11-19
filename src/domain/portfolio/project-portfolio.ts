import { balances } from '../account/account-state';
import { stateFrom } from '../account/decider';
import { eventFromSnapshot, type AccountEvent } from '../account/events';
import type { OrderDetails } from '../order/order';
import type { Instrument } from '../shared/instrument';
import { dailyReturn, type MarketPrice } from '../shared/market-price';
import { Money } from '../shared/money';
import { Percentage } from '../shared/percentage';
import type { Quantity } from '../shared/quantity';

export const POSITION_WARNINGS = ['NEGATIVE_QUANTITY', 'NO_MARKET_PRICE'] as const;
export type PositionWarning = (typeof POSITION_WARNINGS)[number];

export interface Position {
  instrument: Instrument;
  quantity: Quantity;
  avgCostPrice: Money | null;
  lastPrice: Money | null;
  marketValue: Money | null;
  gain: Money | null;
  returnPct: Percentage | null;
  dailyReturn: Percentage | null;
  warnings: PositionWarning[];
}

export interface Portfolio {
  cash: { total: Money; reserved: Money; available: Money };
  /** Pesos (incluidos los reservados) + valor de mercado de las posiciones con precio. */
  totalValue: Money;
  /** Los avisos de todas las posiciones. Con `NO_MARKET_PRICE`, el valor total está incompleto. */
  warnings: PositionWarning[];
  /** Ordenadas por ticker. Las tenencias en 0 no se listan. */
  positions: Position[];
}

export interface PortfolioInput {
  /** Eventos de la cuenta, en el orden en que ocurrieron. */
  events: readonly AccountEvent[];
  instruments: ReadonlyMap<number, Instrument>;
  /** Último precio por instrumento. Un instrumento sin precios no está. */
  prices: ReadonlyMap<number, MarketPrice>;
}

/** Las compras y ventas ejecutadas, en orden. Un evento legacy cuenta por su equivalente. */
function filledTrades(events: readonly AccountEvent[]): OrderDetails[] {
  const trades: OrderDetails[] = [];
  for (const event of events) {
    const effective = event.type === 'LegacyOrderImported' ? eventFromSnapshot(event.order) : event;
    if (effective?.type === 'OrderFilled') trades.push(effective.order);
  }
  return trades;
}

/**
 * Costo promedio ponderado de las acciones que el usuario todavía tiene
 * (ADR-0004, punto 2). Recorre las compras y ventas ejecutadas en orden:
 *
 * - Una compra recalcula el promedio: `(qty × avg + size × price) / (qty + size)`.
 * - Una venta baja la cantidad sin cambiar el promedio. Si llega a 0, se reinicia.
 * - Una compra sobre una tenencia en 0 o negativa arranca un promedio nuevo con su precio.
 */
function averageCosts(events: readonly AccountEvent[]): Map<number, Money> {
  const running = new Map<number, { quantity: Quantity; average: Money }>();

  for (const order of filledTrades(events)) {
    const { size, price } = order;
    const current = running.get(order.instrumentId);

    if (order.side === 'BUY') {
      if (!current || current.quantity.isZero() || current.quantity.isNegative()) {
        const quantity = current ? current.quantity.plus(size) : size;
        running.set(order.instrumentId, { quantity, average: price });
      } else {
        const quantity = current.quantity.plus(size);
        const average = current.average.times(current.quantity).plus(price.times(size)).dividedBy(quantity);
        running.set(order.instrumentId, { quantity, average });
      }
    } else if (current) {
      running.set(order.instrumentId, { ...current, quantity: current.quantity.minus(size) });
    } else {
      running.set(order.instrumentId, { quantity: size.negated(), average: Money.zero() });
    }
  }

  const averages = new Map<number, Money>();
  for (const [instrumentId, { quantity, average }] of running) {
    if (!quantity.isZero() && !quantity.isNegative()) averages.set(instrumentId, average);
  }
  return averages;
}

export function projectPortfolio({ events, instruments, prices }: PortfolioInput): Portfolio {
  const state = balances(stateFrom(events));
  const averages = averageCosts(events);

  const positions: Position[] = [];
  for (const [instrumentId, holding] of state.holdings) {
    if (holding.quantity.isZero()) continue;

    const instrument = instruments.get(instrumentId);
    if (!instrument) throw new Error(`Falta el instrumento ${instrumentId} de una posición`);

    const quantity = holding.quantity;
    const negative = quantity.isNegative();
    const price = prices.get(instrumentId) ?? null;

    const warnings: PositionWarning[] = [];
    if (negative) warnings.push('NEGATIVE_QUANTITY');
    if (!price) warnings.push('NO_MARKET_PRICE');

    const avgCostPrice = negative ? null : (averages.get(instrumentId) ?? null);
    const marketValue = price ? price.close.times(quantity) : null;
    const costBasis = avgCostPrice ? avgCostPrice.times(quantity) : null;

    positions.push({
      instrument,
      quantity,
      avgCostPrice,
      lastPrice: price?.close ?? null,
      marketValue,
      gain: marketValue && costBasis ? marketValue.minus(costBasis) : null,
      returnPct: marketValue && costBasis ? Percentage.change(costBasis, marketValue) : null,
      dailyReturn: price ? dailyReturn(price) : null,
      warnings,
    });
  }

  positions.sort((a, b) => a.instrument.ticker.localeCompare(b.instrument.ticker));

  const totalValue = positions.reduce(
    (total, position) => (position.marketValue ? total.plus(position.marketValue) : total),
    state.cash,
  );

  return {
    cash: { total: state.cash, reserved: state.reservedCash, available: state.availableCash },
    totalValue,
    warnings: POSITION_WARNINGS.filter((warning) =>
      positions.some((position) => position.warnings.includes(warning)),
    ),
    positions,
  };
}
