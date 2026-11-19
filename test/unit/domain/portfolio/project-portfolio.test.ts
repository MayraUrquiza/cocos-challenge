import type { AccountEvent } from '../../../../src/domain/account/events';
import { projectPortfolio } from '../../../../src/domain/portfolio/project-portfolio';
import { Money } from '../../../../src/domain/shared/money';
import { Quantity } from '../../../../src/domain/shared/quantity';
import { PAMP, seedInstruments, seedPrices } from '../../../support/seed-account';

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
  describe('costo promedio (ADR-0004, punto 2)', () => {
    it('una compra recalcula el promedio y una venta no lo cambia', () => {
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

    it('una compra sobre una tenencia negativa arranca un promedio nuevo', () => {
      const position = positionOf([
        trade(1, 'BUY', '20', '100'),
        trade(2, 'SELL', '30', '110'),
        trade(3, 'BUY', '15', '200'),
      ]);

      expect(position?.quantity.toString()).toBe('5');
      expect(position?.avgCostPrice?.toString()).toBe('200.00');
    });
  });

  it('una tenencia en 0 no se lista', () => {
    expect(positionOf([trade(1, 'BUY', '10', '100'), trade(2, 'SELL', '10', '120')])).toBeUndefined();
  });

  it('sin precios: aviso NO_MARKET_PRICE, no suma al total y valor, ganancia y rendimiento en null (ADR-0004, punto 3)', () => {
    const portfolio = projectPortfolio({
      events: [trade(1, 'BUY', '10', '100')],
      instruments: seedInstruments,
      prices: new Map(),
    });

    expect(portfolio.positions[0]).toMatchObject({
      marketValue: null,
      gain: null,
      returnPct: null,
      warnings: ['NO_MARKET_PRICE'],
    });
    expect(portfolio.totalValue.toString()).toBe('-1000.00');
    expect(portfolio.warnings).toEqual(['NO_MARKET_PRICE']);
  });
});
