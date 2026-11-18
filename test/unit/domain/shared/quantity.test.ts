import { Quantity, quantityScale } from '../../../../src/domain/shared/quantity';

describe('quantityScale', () => {
  it('las acciones son enteras y los pesos tienen centavos', () => {
    expect(quantityScale('ACCIONES')).toBe(0);
    expect(quantityScale('MONEDA')).toBe(2);
  });
});

describe('Quantity', () => {
  it('se muestra con la escala de su instrumento', () => {
    expect(Quantity.of('40', 0).toString()).toBe('40');
    expect(Quantity.of('200000.5', 2).toString()).toBe('200000.50');
    expect(Quantity.of(-10, 0).toString()).toBe('-10');
  });

  it('acepta ceros decimales en acciones, como los que guarda NUMERIC(18,2)', () => {
    expect(Quantity.of('50.00', 0).toString()).toBe('50');
  });

  it('rechaza acciones fraccionarias', () => {
    expect(() => Quantity.of('1.5', 0)).toThrow('1.5 tiene más de 0 decimales');
  });

  it('rechaza pesos con más de 2 decimales', () => {
    expect(() => Quantity.of('10.005', 2)).toThrow(RangeError);
  });

  it('distingue la cantidad 0', () => {
    expect(Quantity.of('0.00', 0).isZero()).toBe(true);
    expect(Quantity.of('1', 0).isZero()).toBe(false);
  });
});
