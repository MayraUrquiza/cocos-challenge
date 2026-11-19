import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Al cambiar de estado, una orden actualiza también su `datetime`, que pasa a
 * ser el momento de su último cambio (ADR-0003, punto 6). Así el orden por
 * fecha refleja cuándo se ejecutó cada orden, que es lo que necesita el costo
 * promedio (ADR-0004, punto 2).
 */
export const orderDatetimeUpdates: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`GRANT UPDATE (datetime) ON orders TO cocos_app`.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`REVOKE UPDATE (datetime) ON orders FROM cocos_app`.execute(db);
  },
};
