import { ConfigError, loadMigrationConfig } from '../config/config';
import { loadDotEnv } from '../config/dotenv';
import { createDatabase } from './connection';
import { MigrationError, migrateToLatest } from './migrator';

/** CLI de migraciones: `npm run db:migrate`. Usa el usuario con permisos de DDL. */
async function main(): Promise<void> {
  loadDotEnv();
  const { migrationDatabaseUrl } = loadMigrationConfig();
  const db = createDatabase<unknown>(migrationDatabaseUrl);

  try {
    const results = await migrateToLatest(db);
    if (results.length === 0) {
      console.log('Sin migraciones pendientes.');
    }
    for (const result of results) {
      console.log(`Aplicada: ${result.migrationName}`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(err.message);
  } else if (err instanceof MigrationError) {
    for (const result of err.results) {
      console.error(`${result.status === 'Error' ? 'Falló' : 'No aplicada'}: ${result.migrationName}`);
    }
    console.error(err.cause);
  } else {
    console.error(err);
  }
  process.exit(1);
});
