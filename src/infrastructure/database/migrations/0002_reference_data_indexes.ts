import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Índices únicos de precios e instrumentos (ADR-0003, punto 6). */
export const referenceDataIndexes: Migration = {
  async up(db: Kysely<unknown>) {
    // Último precio por instrumento, sin dos precios para el mismo día.
    await sql`
      CREATE UNIQUE INDEX marketdata_instrumentid_date_key ON marketdata (instrumentId, date)
    `.execute(db);
    // Un ticker identifica a un solo instrumento.
    await sql`CREATE UNIQUE INDEX instruments_ticker_key ON instruments (ticker)`.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`DROP INDEX instruments_ticker_key`.execute(db);
    await sql`DROP INDEX marketdata_instrumentid_date_key`.execute(db);
  },
};
