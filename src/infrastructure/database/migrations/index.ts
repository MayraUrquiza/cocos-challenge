import type { Migration } from 'kysely/migration';
import { ordersConstraints } from './0001_orders_constraints';
import { referenceDataIndexes } from './0002_reference_data_indexes';
import { unaccent } from './0003_unaccent';
import { appReadGrants } from './0004_app_read_grants';

/**
 * Migraciones en orden de ejecución. Se listan a mano en lugar de leer la
 * carpeta, así funcionan igual desde src/ con tsx y desde dist/ compilado.
 * Una migración ya aplicada no se modifica: los cambios van en una nueva.
 */
export const migrations: Record<string, Migration> = {
  '0001_orders_constraints': ordersConstraints,
  '0002_reference_data_indexes': referenceDataIndexes,
  '0003_unaccent': unaccent,
  '0004_app_read_grants': appReadGrants,
};
