import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * La cancelación y la ejecución simulada solo cambian el estado de una orden
 * pendiente (ADR-0002, punto 3): la aplicación puede actualizar esa columna y
 * ninguna otra.
 */
export const orderStatusUpdates: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`GRANT UPDATE (status) ON orders TO cocos_app`.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`REVOKE UPDATE (status) ON orders FROM cocos_app`.execute(db);
  },
};
