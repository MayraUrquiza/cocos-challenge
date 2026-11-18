import { dailyReturn } from '../../../../src/domain/shared/market-price';
import { Money } from '../../../../src/domain/shared/money';
import { Percentage } from '../../../../src/domain/shared/percentage';

describe('Percentage.change', () => {
  it('calcula la variación porcentual', () => {
    expect(Percentage.change(Money.of('100'), Money.of('110'))?.toString()).toBe('10.00');
    expect(Percentage.change(Money.of('100'), Money.of('90'))?.toString()).toBe('-10.00');
  });

  it('redondea half up, también en negativos', () => {
    // 0,445 % y −0,445 %
    expect(Percentage.change(Money.of('100000'), Money.of('100445'))?.toString()).toBe('0.45');
    expect(Percentage.change(Money.of('100000'), Money.of('99555'))?.toString()).toBe('-0.45');
  });

  it('sin base no hay variación', () => {
    expect(Percentage.change(Money.zero(), Money.of('10'))).toBeNull();
  });
});

describe('dailyReturn', () => {
  it('reproduce los retornos diarios del RFC', () => {
    const pamp = { close: Money.of('925.85'), previousClose: Money.of('921.80') };
    const bma = { close: Money.of('1502.80'), previousClose: Money.of('1520.25') };

    expect(dailyReturn(pamp)?.toString()).toBe('0.44');
    expect(dailyReturn(bma)?.toString()).toBe('-1.15');
  });

  it('sin cierre anterior no hay retorno diario', () => {
    expect(dailyReturn({ close: Money.of('100'), previousClose: null })).toBeNull();
  });
});
