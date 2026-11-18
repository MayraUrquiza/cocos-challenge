import { type Decimal, parseDecimal } from './decimal';
import type { InstrumentType } from './instrument';

export type QuantityScale = 0 | 2;

export function quantityScale(type: InstrumentType): QuantityScale {
  switch (type) {
    case 'ACCIONES':
      return 0;
    case 'MONEDA':
      return 2;
  }
}

export class Quantity {
  private constructor(
    private readonly value: Decimal,
    readonly scale: QuantityScale,
  ) {}

  static of(value: string | number, scale: QuantityScale): Quantity {
    const parsed = parseDecimal(value);
    if (parsed.decimalPlaces() > scale) {
      throw new RangeError(`${String(value)} tiene más de ${scale} decimales`);
    }
    return new Quantity(parsed, scale);
  }

  static zero(scale: QuantityScale): Quantity {
    return Quantity.of(0, scale);
  }

  plus(other: Quantity): Quantity {
    return new Quantity(this.value.plus(other.value), this.widerScale(other));
  }

  minus(other: Quantity): Quantity {
    return new Quantity(this.value.minus(other.value), this.widerScale(other));
  }

  negated(): Quantity {
    return new Quantity(this.value.negated(), this.scale);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  private widerScale(other: Quantity): QuantityScale {
    return Math.max(this.scale, other.scale) as QuantityScale;
  }

  toDecimal(): Decimal {
    return this.value;
  }

  toString(): string {
    return this.value.toFixed(this.scale);
  }
}
