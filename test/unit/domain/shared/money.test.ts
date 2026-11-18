import { Money } from '../../../../src/domain/shared/money';

describe('Money', () => {
  it('se muestra con 2 decimales', () => {
    expect(Money.of('925.85').toString()).toBe('925.85');
    expect(Money.of('753000').toString()).toBe('753000.00');
    expect(Money.of(-15028).toString()).toBe('-15028.00');
  });

  it('suma y resta sin errores de redondeo', () => {
    expect(Money.of('0.1').plus(Money.of('0.2')).toString()).toBe('0.30');
    expect(Money.of('0.3').minus(Money.of('0.1')).equals(Money.of('0.2'))).toBe(true);
  });

  it('conserva montos grandes con centavos', () => {
    expect(Money.of('99999999.99').plus(Money.of('0.01')).toString()).toBe('100000000.00');
  });

  it.each(['', 'abc', '1e5', '1,5', '12.', '.5', 'NaN', 'Infinity'])(
    'rechaza "%s"',
    (value) => {
      expect(() => Money.of(value)).toThrow(RangeError);
    },
  );

  it('es inmutable', () => {
    const base = Money.of('100');
    base.plus(Money.of('50'));
    expect(base.toString()).toBe('100.00');
  });
});
