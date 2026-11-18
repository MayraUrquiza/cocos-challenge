import { Decimal, parseDecimal } from './decimal';

export class Money {
  private constructor(private readonly amount: Decimal) {}

  static of(value: string | number): Money {
    return new Money(parseDecimal(value));
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  plus(other: Money): Money {
    return new Money(this.amount.plus(other.amount));
  }

  minus(other: Money): Money {
    return new Money(this.amount.minus(other.amount));
  }

  isZero(): boolean {
    return this.amount.isZero();
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
