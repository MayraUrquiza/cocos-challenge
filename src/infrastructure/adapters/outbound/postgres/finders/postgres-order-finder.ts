import type { Kysely } from 'kysely';
import type { OrderFinder } from '../../../../../application/ports/outbound/order-finder';
import type { OrderView } from '../../../../../application/shared/order-view';
import type { PageRequest } from '../../../../../application/shared/pagination';
import type { DB } from '../../../../database/schema';
import { toOrderView } from '../mappers/order';

export class PostgresOrderFinder implements OrderFinder {
  constructor(private readonly db: Kysely<DB>) {}

  private ordersOf(userId: number) {
    return this.db
      .selectFrom('orders as o')
      .innerJoin('instruments as i', 'i.id', 'o.instrumentid')
      .where('o.userid', '=', userId);
  }

  private withColumns(query: ReturnType<PostgresOrderFinder['ordersOf']>) {
    return query.select([
      'o.id',
      'o.userid',
      'o.instrumentid',
      'o.side',
      'o.type',
      'o.size',
      'o.price',
      'o.status',
      'o.rejectreason',
      'o.datetime',
      'i.type as instrument_type',
    ]);
  }

  async findById({ userId, orderId }: { userId: number; orderId: number }): Promise<OrderView | null> {
    const row = await this.withColumns(this.ordersOf(userId))
      .where('o.id', '=', orderId)
      .executeTakeFirst();
    return row ? toOrderView(row) : null;
  }

  async listByUser({
    userId,
    limit,
    offset,
  }: { userId: number } & PageRequest): Promise<{ items: OrderView[]; total: number }> {
    const [count, rows] = await Promise.all([
      this.ordersOf(userId)
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow(),
      this.withColumns(this.ordersOf(userId))
        .orderBy('o.datetime', 'desc')
        .orderBy('o.id', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
    ]);

    return { items: rows.map(toOrderView), total: Number(count.total) };
  }
}
