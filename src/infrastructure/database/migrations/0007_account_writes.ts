import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

export const accountWrites: Migration = {
  async up(db: Kysely<unknown>) {
    // Las órdenes se insertan con un número reservado antes de decidir, así la
    // orden y su evento nacen con el mismo id.
    await sql`GRANT INSERT ON orders TO cocos_app`.execute(db);
    await sql`GRANT USAGE ON SEQUENCE orders_id_seq TO cocos_app`.execute(db);

    // Bloquea la cuenta con SELECT … FOR UPDATE sobre su usuario. FOR UPDATE
    // exige permiso de UPDATE sobre la tabla, y la aplicación no debe poder
    // modificar usuarios: la función corre con los permisos de su dueño
    // (SECURITY DEFINER) y la aplicación solo puede ejecutarla. El bloqueo dura
    // hasta el fin de la transacción que la llamó.
    await sql`
      CREATE FUNCTION lock_account(p_user_id integer) RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        PERFORM 1 FROM users WHERE id = p_user_id FOR UPDATE;
        RETURN FOUND;
      END;
      $$
    `.execute(db);
    await sql`REVOKE ALL ON FUNCTION lock_account(integer) FROM PUBLIC`.execute(db);
    await sql`GRANT EXECUTE ON FUNCTION lock_account(integer) TO cocos_app`.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`DROP FUNCTION lock_account(integer)`.execute(db);
    await sql`REVOKE USAGE ON SEQUENCE orders_id_seq FROM cocos_app`.execute(db);
    await sql`REVOKE INSERT ON orders FROM cocos_app`.execute(db);
  },
};
