import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { backfillLegacyOrders } from '../backfill/legacy-orders';

/** Carga las órdenes semilla en el historial, así está completo desde el primer día. */
export const backfillLegacyOrdersMigration: Migration = {
  async up(db: Kysely<unknown>) {
    await backfillLegacyOrders(db);
  },

  /**
   * Los eventos no se pueden borrar (los triggers lo impiden). Revertir la 0005
   * elimina la tabla completa, con estos eventos incluidos.
   */
  async down() {},
};
