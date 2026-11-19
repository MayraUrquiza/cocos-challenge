import type { Money } from '../../../domain/shared/money';
import type { Quantity } from '../../../domain/shared/quantity';
import type { IdempotencyKey, RecordedOrder } from '../../shared/idempotency';

interface PlaceOrderBase {
  userId: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  quantity: { size: Quantity } | { amount: Money };
  correlationId: string | null;
  idempotency: IdempotencyKey | null;
}

/**
 * El tipo de orden decide si hay precio (ADR-0005, punto 4): una MARKET no
 * lleva precio porque se ejecuta al último, y una LIMIT lo exige. Una MARKET
 * con precio o una LIMIT sin precio no compilan.
 */
export type PlaceOrderCommand =
  | (PlaceOrderBase & { type: 'MARKET' })
  | (PlaceOrderBase & { type: 'LIMIT'; price: Money });

export interface PlaceOrder {
  execute(command: PlaceOrderCommand): Promise<RecordedOrder>;
}
