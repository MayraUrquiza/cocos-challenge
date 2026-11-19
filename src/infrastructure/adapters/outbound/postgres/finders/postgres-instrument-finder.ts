import { sql, type Kysely } from 'kysely';
import type { PageRequest } from '../../../../../application/shared/pagination';
import type {
  InstrumentFinder,
  InstrumentMatch,
} from '../../../../../application/ports/outbound/instrument-finder';
import type { Instrument } from '../../../../../domain/shared/instrument';
import type { DB } from '../../../../database/schema';
import { toInstrument, toMarketPrice } from '../mappers/instrument';

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class PostgresInstrumentFinder implements InstrumentFinder {
  constructor(private readonly db: Kysely<DB>) {}

  async findByTicker(ticker: string): Promise<Instrument | null> {
    const row = await this.db
      .selectFrom('instruments')
      .select(['id', 'ticker', 'name', 'type'])
      .where('ticker', '=', ticker)
      .executeTakeFirst();
    return row ? toInstrument(row) : null;
  }

  async findById(instrumentId: number): Promise<Instrument | null> {
    const row = await this.db
      .selectFrom('instruments')
      .select(['id', 'ticker', 'name', 'type'])
      .where('id', '=', instrumentId)
      .executeTakeFirst();
    return row ? toInstrument(row) : null;
  }

  async search({
    text,
    limit,
    offset,
  }: { text: string } & PageRequest): Promise<{ items: InstrumentMatch[]; total: number }> {
    const escaped = escapeLike(text);
    const contains = `%${escaped}%`;
    const startsWith = `${escaped}%`;

    const matches = this.db
      .selectFrom('instruments as i')
      .where('i.type', '<>', 'MONEDA')
      .where((eb) =>
        eb.or([
          eb(sql<string>`unaccent(i.ticker)`, 'ilike', sql<string>`unaccent(${contains})`),
          eb(sql<string>`unaccent(i.name)`, 'ilike', sql<string>`unaccent(${contains})`),
        ]),
      );

    const [count, rows] = await Promise.all([
      matches.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
      matches
        .leftJoinLateral(
          (eb) =>
            eb
              .selectFrom('marketdata as m')
              .select(['m.close', 'm.previousclose'])
              .whereRef('m.instrumentid', '=', 'i.id')
              .orderBy('m.date', 'desc')
              .limit(1)
              .as('p'),
          (join) => join.onTrue(),
        )
        .select(['i.id', 'i.ticker', 'i.name', 'i.type', 'p.close', 'p.previousclose'])
        .orderBy(
          sql`CASE
            WHEN upper(i.ticker) = upper(${text}) THEN 0
            WHEN i.ticker ILIKE ${startsWith} THEN 1
            ELSE 2
          END`,
        )
        .orderBy('i.ticker')
        .limit(limit)
        .offset(offset)
        .execute(),
    ]);

    return {
      items: rows.map((row) => ({
        ...toInstrument(row),
        price: toMarketPrice(row.close, row.previousclose),
      })),
      total: Number(count.total),
    };
  }
}
