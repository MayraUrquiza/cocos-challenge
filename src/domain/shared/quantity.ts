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

  isZero(): boolean {
    return this.value.isZero();
  }

  toDecimal(): Decimal {
    return this.value;
  }

  toString(): string {
    return this.value.toFixed(this.scale);
  }
}
