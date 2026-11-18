import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';

export function createDatabase<DB = Record<string, never>>(
  connectionString: string,
  onIdleConnectionError: (err: Error) => void = () => {},
): Kysely<DB> {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2_000,
  });
  // Si la base corta una conexión inactiva (reinicio, failover), pg emite 'error'
  // en el pool. Sin este listener, Node termina el proceso. El pool descarta esa
  // conexión y abre otra en el próximo pedido.
  pool.on('error', onIdleConnectionError);

  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

export async function checkDatabase<DB>(db: Kysely<DB>): Promise<void> {
  await sql`SELECT 1`.execute(db);
}
