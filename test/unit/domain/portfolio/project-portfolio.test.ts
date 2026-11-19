import type { AccountEvent } from '../../../../src/domain/account/events';
import { projectPortfolio } from '../../../../src/domain/portfolio/project-portfolio';
import { Money } from '../../../../src/domain/shared/money';
import { Quantity } from '../../../../src/domain/shared/quantity';
import {
  PAMP,
  seedEvents,
  seedHistory,
  seedInstruments,
  seedPrices,
} from '../../../support/seed-account';

function trade(orderId: number, side: 'BUY' | 'SELL', size: string, price: string): AccountEvent {
  return {
    type: 'OrderFilled',
    order: {
      orderId,
      instrumentId: PAMP,
      side,
      type: 'MARKET',
      size: Quantity.of(size, 0),
      price: Money.of(price),
    },
  };
}

function positionOf(events: AccountEvent[]) {
  const portfolio = projectPortfolio({ events, instruments: seedInstruments, prices: seedPrices });
  return portfolio.positions.find((position) => position.instrument.id === PAMP);
}

describe('projectPortfolio', () => {
  it('el historial completo y los estados finales de las órdenes dan el mismo portfolio', () => {
    const fromHistory = projectPortfolio({ events: seedHistory, instruments: seedInstruments, prices: seedPrices });
    const fromOrders = projectPortfolio({ events: seedEvents, instruments: seedInstruments, prices: seedPrices });

    expect(JSON.stringify(fromHistory)).toBe(JSON.stringify(fromOrders));
  });

  describe('con las 11 órdenes del usuario 1 (ejemplo del RFC)', () => {
    const portfolio = projectPortfolio({
      events: seedEvents,
      instruments: seedInstruments,
      prices: seedPrices,
    });

    const byTicker = (ticker: string) =>
      portfolio.positions.find((position) => position.instrument.ticker === ticker)!;

    it('calcula los pesos y el valor total', () => {
      expect(portfolio.cash.total.toString()).toBe('753000.00');
      expect(portfolio.cash.reserved.toString()).toBe('125500.00');
      expect(portfolio.cash.available.toString()).toBe('627500.00');
      expect(portfolio.totalValue.toString()).toBe('889756.00');
    });

    it('lista las posiciones por ticker', () => {
      expect(portfolio.positions.map((position) => position.instrument.ticker)).toEqual([
        'BMA',
        'METR',
        'PAMP',
      ]);
    });

    it('PAMP: 40 a 930, con una pérdida de 166 (−0,45 %)', () => {
      const pamp = byTicker('PAMP');

      expect(pamp.quantity.toString()).toBe('40');
      expect(pamp.avgCostPrice?.toString()).toBe('930.00');
      expect(pamp.lastPrice?.toString()).toBe('925.85');
      expect(pamp.marketValue?.toString()).toBe('37034.00');
      expect(pamp.gain?.toString()).toBe('-166.00');
      expect(pamp.returnPct?.toString()).toBe('-0.45');
      expect(pamp.dailyReturn?.toString()).toBe('0.44');
      expect(pamp.warnings).toEqual([]);
    });

    it('METR: 500 a 250, con una pérdida de 10.250 (−8,20 %)', () => {
      const metr = byTicker('METR');

      expect(metr.marketValue?.toString()).toBe('114750.00');
      expect(metr.gain?.toString()).toBe('-10250.00');
      expect(metr.returnPct?.toString()).toBe('-8.20');
    });

    it('BMA: −10 con aviso, suma al total y sin costo, ganancia ni rendimiento', () => {
      const bma = byTicker('BMA');

      expect(bma.quantity.toString()).toBe('-10');
      expect(bma.marketValue?.toString()).toBe('-15028.00');
      expect(bma.avgCostPrice).toBeNull();
      expect(bma.gain).toBeNull();
      expect(bma.returnPct).toBeNull();
      expect(bma.dailyReturn?.toString()).toBe('-1.15');
      expect(bma.warnings).toEqual(['NEGATIVE_QUANTITY']);
    });

    it('reúne los avisos de las posiciones', () => {
      expect(portfolio.warnings).toEqual(['NEGATIVE_QUANTITY']);
    });
  });

  describe('costo promedio', () => {
    it('una compra recalcula el promedio ponderado (ejemplo de ADR-0004)', () => {
      const position = positionOf([trade(1, 'BUY', '10', '100'), trade(2, 'BUY', '10', '200')]);

      expect(position?.quantity.toString()).toBe('20');
      expect(position?.avgCostPrice?.toString()).toBe('150.00');
    });

    it('una venta baja la cantidad sin cambiar el promedio', () => {
      const position = positionOf([
        trade(1, 'BUY', '10', '100'),
        trade(2, 'BUY', '10', '200'),
        trade(3, 'SELL', '5', '500'),
      ]);

      expect(position?.quantity.toString()).toBe('15');
      expect(position?.avgCostPrice?.toString()).toBe('150.00');
    });

    it('si la tenencia llega a 0, el promedio se reinicia', () => {
      const position = positionOf([
        trade(1, 'BUY', '10', '100'),
        trade(2, 'SELL', '10', '120'),
        trade(3, 'BUY', '5', '300'),
      ]);

      expect(position?.avgCostPrice?.toString()).toBe('300.00');
    });

    it('cuenta los eventos legacy por su equivalente', () => {
      const position = positionOf([
        trade(1, 'BUY', '10', '100'),
        {
          type: 'LegacyOrderImported',
          order: {
            orderId: 2,
            instrumentId: PAMP,
            side: 'BUY',
            type: 'LIMIT',
            size: Quantity.of('10', 0),
            price: Money.of('200'),
            status: 'FILLED',
          },
        },
      ]);

      expect(position?.avgCostPrice?.toString()).toBe('150.00');
    });

    it('una compra sobre una tenencia negativa arranca un promedio nuevo', () => {
      const position = positionOf([
        trade(1, 'BUY', '20', '100'),
        trade(2, 'SELL', '30', '110'),
        trade(3, 'BUY', '15', '200'),
      ]);

      expect(position?.quantity.toString()).toBe('5');
      expect(position?.avgCostPrice?.toString()).toBe('200.00');
    });

    it('conserva la precisión y redondea solo al mostrar', () => {
      const position = positionOf([trade(1, 'BUY', '1', '100'), trade(2, 'BUY', '2', '100.01')]);

      // (100 + 200,02) / 3 = 100,00666…
      expect(position?.avgCostPrice?.toString()).toBe('100.01');
      expect(position?.gain?.toString()).toBe('2477.53');
    });
  });

  it('una tenencia en 0 no se lista', () => {
    expect(positionOf([trade(1, 'BUY', '10', '100'), trade(2, 'SELL', '10', '120')])).toBeUndefined();
  });

  it('sin precios: aviso, no suma al total, y precio, valor, ganancia y rendimiento en null', () => {
    const portfolio = projectPortfolio({
      events: [trade(1, 'BUY', '10', '100')],
      instruments: seedInstruments,
      prices: new Map(),
    });

    expect(portfolio.positions[0]).toMatchObject({
      lastPrice: null,
      marketValue: null,
      gain: null,
      returnPct: null,
      dailyReturn: null,
      warnings: ['NO_MARKET_PRICE'],
    });
    expect(portfolio.positions[0]!.avgCostPrice?.toString()).toBe('100.00');
    expect(portfolio.totalValue.toString()).toBe('-1000.00');
    expect(portfolio.warnings).toEqual(['NO_MARKET_PRICE']);
  });

  it('una cuenta sin órdenes está en cero y sin avisos', () => {
    const portfolio = projectPortfolio({
      events: [],
      instruments: seedInstruments,
      prices: seedPrices,
    });

    expect(portfolio.totalValue.toString()).toBe('0.00');
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.warnings).toEqual([]);
  });
});
