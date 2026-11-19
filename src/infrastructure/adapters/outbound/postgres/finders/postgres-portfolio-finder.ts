import type { Kysely } from 'kysely';
import type {
  PortfolioAccount,
  PortfolioFinder,
} from '../../../../../application/ports/outbound/portfolio-finder';
import { eventFromSnapshot } from '../../../../../domain/account/events';
import type { Instrument } from '../../../../../domain/shared/instrument';
import type { DB } from '../../../../database/schema';
import { toInstrument } from '../mappers/instrument';
import { toOrderSnapshot } from '../mappers/order';

export class PostgresPortfolioFinder implements PortfolioFinder {
  constructor(private readonly db: Kysely<DB>) {}

  async findAccount(userId: number): Promise<PortfolioAccount | null> {
    const [user, rows] = await Promise.all([
      this.db
        .selectFrom('users')
        .select(['id', 'accountnumber'])
        .where('id', '=', userId)
        .executeTakeFirst(),
      this.db
        .selectFrom('orders as o')
        .innerJoin('instruments as i', 'i.id', 'o.instrumentid')
        .select([
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
          'i.ticker as instrument_ticker',
          'i.name as instrument_name',
        ])
        .where('o.userid', '=', userId)
        .where('o.status', 'in', ['FILLED', 'NEW'])
        .orderBy('o.datetime')
        .orderBy('o.id')
        .execute(),
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

    // Mientras `orders` sea la fuente de verdad, los eventos salen del estado
    // final de cada orden. El saldo solo depende de dónde terminó cada una.
    const events = rows
      .map((row) => eventFromSnapshot(toOrderSnapshot(row)))
      .filter((event) => event !== null);

    return {
      userId: user.id,
      accountNumber: user.accountnumber,
      events,
      instruments: [...instruments.values()],
    };
  }
}
