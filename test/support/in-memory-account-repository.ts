import type {
  AccountContext,
  AccountRepository,
  RecordMetadata,
} from '../../src/application/ports/outbound/account-repository';
import { IdempotencyKeyReusedError, UserNotFoundError } from '../../src/application/shared/errors';
import type { RecordedOrder } from '../../src/application/shared/idempotency';
import type { OrderView } from '../../src/application/shared/order-view';
import type { Decision } from '../../src/domain/account/decision';
import { stateFrom } from '../../src/domain/account/decider';
import type { AccountEvent } from '../../src/domain/account/events';

/**
 * Repositorio en memoria para los tests de casos de uso (ADR-0002, punto 3):
 * arma el estado con `stateFrom` sobre los eventos de la cuenta y guarda el
 * evento y la orden que devuelve `decide`, sin base de datos. Respeta las
 * mismas reglas de reintentos que el repositorio real.
 */
export class InMemoryAccountRepository implements AccountRepository {
  readonly orders: OrderView[] = [];
  readonly recorded: Array<{ userId: number; event: AccountEvent; metadata: RecordMetadata }> = [];
  private readonly history = new Map<number, AccountEvent[]>();
  private readonly keys = new Map<string, { requestHash: string; order: OrderView }>();
  private nextOrderId: number;

  constructor(userIds: number[], firstOrderId = 100) {
    for (const userId of userIds) this.history.set(userId, []);
    this.nextOrderId = firstOrderId;
  }

  /** Carga eventos previos de una cuenta, como si ya hubieran ocurrido. */
  given(userId: number, events: AccountEvent[]): this {
    this.history.get(userId)!.push(...events);
    return this;
  }

  async withAccount(
    userId: number,
    decide: (account: AccountContext) => Decision,
    metadata: RecordMetadata,
  ): Promise<RecordedOrder> {
    const events = this.history.get(userId);
    if (!events) throw new UserNotFoundError(userId);

    const { idempotency } = metadata;
    const keyId = idempotency ? `${userId}:${idempotency.key}` : null;
    const original = keyId ? this.keys.get(keyId) : undefined;
    if (original) {
      if (original.requestHash !== idempotency!.requestHash) {
        throw new IdempotencyKeyReusedError(idempotency!.key);
      }
      return { order: original.order, replayed: true };
    }

    const { event, order } = decide({ state: stateFrom(events), nextOrderId: this.nextOrderId++ });

    events.push(event);
    this.recorded.push({ userId, event, metadata });
    const view: OrderView = {
      id: order.orderId,
      userId,
      instrumentId: order.instrumentId,
      side: order.side,
      type: order.type,
      size: order.size,
      price: order.price,
      status: order.status,
      rejectReason: order.rejectReason,
      datetime: metadata.occurredAt,
    };
    this.orders.push(view);
    if (keyId) this.keys.set(keyId, { requestHash: idempotency!.requestHash, order: view });
    return { order: view, replayed: false };
  }
}
