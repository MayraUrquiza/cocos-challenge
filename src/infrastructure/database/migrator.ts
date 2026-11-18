import type { Kysely } from 'kysely';
import { Migrator, NO_MIGRATIONS, type MigrationResult } from 'kysely/migration';
import { migrations } from './migrations';

export class MigrationError extends Error {
  constructor(
    readonly results: MigrationResult[],
    cause: unknown,
  ) {
    super('Falló una migración', { cause });
    this.name = 'MigrationError';
  }
}

function createMigrator(db: Kysely<unknown>): Migrator {
  return new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
}

/**
 * Aplica las migraciones pendientes. Cada una corre en su propia transacción:
 * si falla, no queda a medias. Sin migraciones pendientes, no hace nada.
 */
export async function migrateToLatest(db: Kysely<unknown>): Promise<MigrationResult[]> {
  const { error, results = [] } = await createMigrator(db).migrateToLatest();
  if (error) throw new MigrationError(results, error);
  return results;
}

/** Revierte todas las migraciones. Solo para tests de las funciones down. */
export async function migrateToEmpty(db: Kysely<unknown>): Promise<MigrationResult[]> {
  const { error, results = [] } = await createMigrator(db).migrateTo(NO_MIGRATIONS);
  if (error) throw new MigrationError(results, error);
  return results;
}
