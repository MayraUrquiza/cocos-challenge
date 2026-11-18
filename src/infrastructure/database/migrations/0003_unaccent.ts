import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Búsqueda que ignora tildes (ADR-0004, punto 7). unaccent es una extensión
 * "trusted": la puede crear el dueño de la base, sin ser superusuario.
 */
export const unaccent: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`CREATE EXTENSION IF NOT EXISTS unaccent`.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`DROP EXTENSION IF EXISTS unaccent`.execute(db);
  },
};
