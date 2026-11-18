import { Decimal, parseDecimal } from './decimal';
import type { Quantity } from './quantity';

export class Money {
  private constructor(private readonly amount: Decimal) {}

  static of(value: string | number): Money {
    return new Money(parseDecimal(value));
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  static ofCash(quantity: Quantity): Money {
    return new Money(quantity.toDecimal());
  }

  plus(other: Money): Money {
    return new Money(this.amount.plus(other.amount));
  }

  minus(other: Money): Money {
    return new Money(this.amount.minus(other.amount));
  }

  negated(): Money {
    return new Money(this.amount.negated());
  }

  /** Precio × cantidad: lo que cuesta o vale una cantidad de acciones. */
  times(quantity: Quantity): Money {
    return new Money(this.amount.times(quantity.toDecimal()));
  }

  /** Monto ÷ cantidad: el precio por unidad. Exacto, sin redondear hasta mostrarlo. */
  dividedBy(quantity: Quantity): Money {
    if (quantity.isZero()) throw new RangeError('No se puede dividir un monto por una cantidad 0');
    return new Money(this.amount.dividedBy(quantity.toDecimal()));
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  toDecimal(): Decimal {
    return this.amount;
  }

  equals(other: Money): boolean {
    return this.amount.equals(other.amount);
  }

  toString(): string {
    return this.amount.toFixed(2);
  }
}
