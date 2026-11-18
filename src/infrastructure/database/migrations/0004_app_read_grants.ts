import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Permisos de lectura del usuario de la aplicación sobre las tablas del
 * challenge. Los de escritura se otorgan en la migración del primer comando
 * que los necesite, para dar solo lo que se usa.
 */
export const appReadGrants: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`GRANT SELECT ON users, instruments, marketdata, orders TO cocos_app`.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`REVOKE SELECT ON users, instruments, marketdata, orders FROM cocos_app`.execute(db);
  },
};
