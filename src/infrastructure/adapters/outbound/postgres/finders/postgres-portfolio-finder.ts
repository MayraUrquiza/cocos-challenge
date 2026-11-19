import type { Kysely } from 'kysely';
import type {
  PortfolioAccount,
  PortfolioFinder,
} from '../../../../../application/ports/outbound/portfolio-finder';
import type { Instrument } from '../../../../../domain/shared/instrument';
import type { DB } from '../../../../database/schema';
import { selectAccountOrders, toAccountEvents } from '../account-orders';
import { toInstrument } from '../mappers/instrument';

export class PostgresPortfolioFinder implements PortfolioFinder {
  constructor(private readonly db: Kysely<DB>) {}

  async findAccount(userId: number): Promise<PortfolioAccount | null> {
    const [user, rows] = await Promise.all([
      this.db
        .selectFrom('users')
        .select(['id', 'accountnumber'])
        .where('id', '=', userId)
        .executeTakeFirst(),
      selectAccountOrders(this.db, userId).execute(),
    ]);

    if (!user) return null;
    if (user.accountnumber === null) {
      throw new Error(`El usuario ${userId} no tiene número de cuenta`);
    }

    const instruments = new Map<number, Instrument>();
    for (const row of rows) {
      if (row.instrumentid !== null && !instruments.has(row.instrumentid)) {
        instruments.set(
          row.instrumentid,
          toInstrument({
            id: row.instrumentid,
            ticker: row.instrument_ticker,
            name: row.instrument_name,
            type: row.instrument_type,
          }),
        );
      }
    }

    return {
      userId: user.id,
      accountNumber: user.accountnumber,
      events: toAccountEvents(rows),
      instruments: [...instruments.values()],
    };
  }
}
