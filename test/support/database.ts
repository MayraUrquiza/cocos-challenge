import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { createDatabase } from '../../src/infrastructure/database/connection';
import { migrateToLatest } from '../../src/infrastructure/database/migrator';
import { testDatabaseUrl } from './env';

const SEED_FILE = path.resolve(__dirname, '../../database.sql');

function adminUrl(): string {
  return process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
}

function migratorUrl(): string {
  return (
    process.env.MIGRATION_DATABASE_URL ??
    'postgres://cocos_migrator:cocos_migrator@localhost:5432/cocos'
  );
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function runAs(url: string, statements: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statements);
  } finally {
    await client.end();
  }
}

export interface TestDatabase {
  name: string;
  appUrl: string;
  migratorUrl: string;
  drop(): Promise<void>;
}

export interface CreateTestDatabaseOptions {
  /** false para probar las migraciones desde cero. */
  migrate?: boolean;
}

/**
 * Crea una base nueva, igual a la de docker-compose: datos semilla cargados
 * por cocos_migrator y migraciones aplicadas. Se usa una por suite porque el
 * historial contable no se puede vaciar (RFC-001, Plan de rollout).
 */
export async function createTestDatabase(
  options: CreateTestDatabaseOptions = {},
): Promise<TestDatabase> {
  const name = `cocos_test_${randomBytes(6).toString('hex')}`;
  const admin = adminUrl();
  const migrator = withDatabase(migratorUrl(), name);

  await runAs(admin, `CREATE DATABASE ${name} OWNER cocos_migrator`);
  await runAs(
    withDatabase(admin, name),
    `
      REVOKE ALL ON DATABASE ${name} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${name} TO cocos_app;
      GRANT USAGE ON SCHEMA public TO cocos_app;
    `,
  );
  await runAs(migrator, await readFile(SEED_FILE, 'utf8'));

  if (options.migrate !== false) {
    const db = createDatabase<unknown>(migrator);
    try {
      await migrateToLatest(db);
    } finally {
      await db.destroy();
    }
  }

  return {
    name,
    appUrl: withDatabase(testDatabaseUrl(), name),
    migratorUrl: migrator,
    drop: () => runAs(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  };
}
