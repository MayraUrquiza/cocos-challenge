import { sql, type Kysely } from 'kysely';
import type {
  AccountEventSources,
  AccountEventsFinder,
} from '../../../../../application/ports/outbound/account-events-finder';
import type { DB } from '../../../../database/schema';
import { selectAccountOrders, toAccountEvents } from '../account-orders';
import { fromEventRecord } from '../mappers/account-event';

export class PostgresAccountEventsFinder implements AccountEventsFinder {
  constructor(private readonly db: Kysely<DB>) {}

  async accountIds(): Promise<number[]> {
    const rows = await this.db.selectFrom('users').select('id').orderBy('id').execute();
    return rows.map((row) => row.id);
  }

  /**
   * Las dos lecturas van en una transacción `REPEATABLE READ`, así ven la base
   * en el mismo instante: un pedido que se confirma entre ambas no aparece
   * como diferencia.
   */
  findEvents(accountId: number): Promise<AccountEventSources> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .setAccessMode('read only')
      .execute(async (trx) => {
        const history = await trx
          .selectFrom('account_events as e')
          // El tipo del instrumento define la escala de `size`. Las transferencias no tienen instrumento.
          .leftJoin('instruments as i', (join) =>
            join.on(sql<boolean>`i.id = (e.payload ->> 'instrumentId')::int`),
          )
          .select([
            'e.account_id',
            'e.sequence',
            'e.event_type',
            'e.event_version',
            'e.payload',
            'e.occurred_at',
            'i.type as instrument_type',
          ])
          .where('e.account_id', '=', accountId)
          .orderBy('e.sequence')
          .execute();
        const orders = await selectAccountOrders(trx, accountId).execute();

        return {
          fromHistory: history.map(fromEventRecord),
          fromOrders: toAccountEvents(orders),
        };
      });
  }
}
