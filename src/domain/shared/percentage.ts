import { Decimal } from './decimal';
import type { Money } from './money';

export class Percentage {
  private constructor(private readonly value: Decimal) {}

  /**
   * Variación porcentual de `from` a `to`: `(to − from) / from × 100`.
   * Sin base (`from` en 0) no hay variación que calcular: devuelve null.
   */
  static change(from: Money, to: Money): Percentage | null {
    if (from.isZero()) return null;
    const base = from.toDecimal();
    return new Percentage(to.toDecimal().minus(base).dividedBy(base).times(100));
  }

  toString(): string {
    return this.value.toFixed(2);
  }
}
