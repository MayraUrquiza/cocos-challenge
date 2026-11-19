import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { ConfigError, loadMigrationConfig } from '../config/config';
import { loadDotEnv } from '../config/dotenv';
import { createDatabase } from './connection';
import { MigrationError, migrateToLatest } from './migrator';

const SEED_FILE = path.resolve(process.cwd(), 'database.sql');

/**
 * Todo lo que crean `database.sql` y las migraciones. `CASCADE` se lleva los
 * índices, triggers y secuencias de cada tabla. Los triggers de `account_events`
 * impiden vaciarla, pero no borrarla.
 */
const DROP_EVERYTHING = `
  DROP TABLE IF EXISTS account_events, orders, marketdata, instruments, users,
    kysely_migration, kysely_migration_lock CASCADE;
  DROP FUNCTION IF EXISTS account_events_reject_changes(), lock_account(integer);
  DROP EXTENSION IF EXISTS unaccent;
`;

function describeTarget(url: string): string {
  const { hostname, pathname, username } = new URL(url);
  return `${username}@${hostname}${pathname}`;
}

/**
 * Vuelve la base al estado inicial: borra todo, carga `database.sql` y aplica
 * las migraciones. Es el `db:reset` de Docker para una base que no se puede
 * recrear con docker compose, como la de Neon: `npm run neon:reset -- --yes`.
 *
 * Los usuarios de base de datos no se tocan: los permisos sobre cada tabla los
 * vuelven a dar las migraciones.
 */
async function main(): Promise<void> {
  loadDotEnv();
  const { migrationDatabaseUrl } = loadMigrationConfig();
  const target = describeTarget(migrationDatabaseUrl);

  if (!process.argv.includes('--yes')) {
    console.error(
      `Esto borra todos los datos de ${target} y la vuelve al contenido de database.sql, migrada.\n` +
        'Para confirmarlo, ejecutar con --yes (con npm: npm run neon:reset -- --yes).',
    );
    process.exitCode = 1;
    return;
  }

  // Borrar y cargar los datos en una sola transacción: si algo falla, la base queda como estaba.
  const client = new pg.Client({ connectionString: migrationDatabaseUrl, enableChannelBinding: true });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(DROP_EVERYTHING);
    await client.query(await readFile(SEED_FILE, 'utf8'));
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
  console.log(`Datos de database.sql cargados en ${target}.`);

  const db = createDatabase<unknown>(migrationDatabaseUrl);
  try {
    for (const result of await migrateToLatest(db)) {
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
    console.error('Los datos ya se cargaron: corregir el problema y aplicar las migraciones que faltan.');
  } else {
    console.error(err);
  }
  process.exit(1);
});
