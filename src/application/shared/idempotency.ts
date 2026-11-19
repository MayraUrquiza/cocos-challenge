import type { OrderView } from './order-view';

export interface IdempotencyKey {
  key: string;
  requestHash: string;
}

export interface RecordedOrder {
  order: OrderView;
  replayed: boolean;
}
