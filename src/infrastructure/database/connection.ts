import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { DB as Database } from './schema';

const DATE_OID = 1082;

// Las fechas de orders son TIMESTAMPTZ: viajan con su zona y pg las convierte
// bien en las dos direcciones, sin importar la zona horaria del proceso.
const typeParsers: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    // marketdata.date es un día calendario, no un instante: se lee como 'YYYY-MM-DD'.
    // Por defecto pg lo convierte a Date en la hora local y lo puede correr de día.
    if (oid === DATE_OID) return (value: string) => value;
    // NUMERIC llega como string, sin pérdida de precisión (ADR-0001, punto 3).
    return pg.types.getTypeParser(oid, format);
  }) as pg.CustomTypesConfig['getTypeParser'],
};

export function createDatabase<DB = Database>(
  connectionString: string,
  onIdleConnectionError: (err: Error) => void = () => {},
): Kysely<DB> {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2_000,
    types: typeParsers,
    enableChannelBinding: true,
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
