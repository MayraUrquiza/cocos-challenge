// Una zona distinta de UTC, para que el test de fechas falle si pg usara la hora local.
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { sql, type Insertable, type Kysely } from 'kysely';
import { createDatabase } from '../../../src/infrastructure/database/connection';
import { migrateToEmpty, migrateToLatest } from '../../../src/infrastructure/database/migrator';
import { migrations } from '../../../src/infrastructure/database/migrations';
import type { DB, Orders } from '../../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../../support/database';

const MIGRATION_COUNT = Object.keys(migrations).length;
const PAMP = 47;
const ARS = 66;

describe('esquema después de las migraciones', () => {
  let testDb: TestDatabase;
  let migrator: Kysely<DB>;
  let app: Kysely<DB>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    migrator = createDatabase(testDb.migratorUrl);
    app = createDatabase(testDb.appUrl);
  });

  afterAll(async () => {
    await app?.destroy();
    await migrator?.destroy();
    await testDb?.drop();
  });

  function insertOrder(values: Partial<Insertable<Orders>> = {}) {
    return migrator
      .insertInto('orders')
      .values({
        instrumentid: PAMP,
        userid: 2,
        side: 'BUY',
        type: 'MARKET',
        status: 'FILLED',
        size: 10,
        price: '930.00',
        datetime: new Date('2026-11-17T14:02:11.000Z'),
        ...values,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  it('las 11 órdenes semilla siguen válidas, con sus valores', async () => {
    const orders = await app.selectFrom('orders').selectAll().orderBy('id').execute();

    expect(orders).toHaveLength(11);
    expect(orders[0]).toMatchObject({ side: 'CASH_IN', size: '1000000.00', price: '1.00' });
  });

  it('una orden de acciones con size fraccionario es rechazada, una transferencia con centavos no', async () => {
    await expect(insertOrder({ side: 'BUY', size: '1.5' })).rejects.toThrow(
      /orders_size_whole_units_check/,
    );
    await expect(
      insertOrder({ instrumentid: ARS, side: 'CASH_IN', size: '200000.50', price: '1.00' }),
    ).resolves.toBeDefined();
  });

  it('una fecha se lee y se escribe como el mismo instante, aunque el proceso no esté en UTC', async () => {
    const seed = await app
      .selectFrom('orders')
      .select('datetime')
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    expect(seed.datetime?.toISOString()).toBe('2023-07-12T12:11:20.000Z');

    const { id } = await insertOrder({ datetime: new Date('2026-11-17T14:02:11.000Z') });
    const { rows } = await sql<{ stored: string }>`
      SELECT (datetime AT TIME ZONE 'UTC')::text AS stored FROM orders WHERE id = ${id}
    `.execute(migrator);
    expect(rows[0]!.stored).toBe('2026-11-17 14:02:11');
  });
});

describe('migraciones desde cero', () => {
  let testDb: TestDatabase;
  let migrator: Kysely<unknown>;

  beforeAll(async () => {
    testDb = await createTestDatabase({ migrate: false });
    migrator = createDatabase<unknown>(testDb.migratorUrl);
  });

  afterAll(async () => {
    await migrator?.destroy();
    await testDb?.drop();
  });

  /** Fecha y hora UTC de la primera orden semilla, sea TIMESTAMP o TIMESTAMPTZ. */
  async function firstOrderUtc(): Promise<string> {
    const { rows } = await sql<{ value: string }>`
      SELECT CASE
        WHEN pg_typeof(datetime) = 'timestamp with time zone'::regtype
          THEN (datetime AT TIME ZONE 'UTC')::text
        ELSE datetime::text
      END AS value
      FROM orders WHERE id = 1
    `.execute(migrator);
    return rows[0]!.value;
  }

  it('se aplican sobre la base semilla, se pueden volver a ejecutar y conservan el instante de las órdenes', async () => {
    expect(await migrateToLatest(migrator)).toHaveLength(MIGRATION_COUNT);
    expect(await migrateToLatest(migrator)).toEqual([]);
    expect(await firstOrderUtc()).toBe('2023-07-12 12:11:20');
  });

  it('se pueden revertir y volver a aplicar', async () => {
    expect(await migrateToEmpty(migrator)).toHaveLength(MIGRATION_COUNT);
    expect(await firstOrderUtc()).toBe('2023-07-12 12:11:20');
    await expect(migrateToLatest(migrator)).resolves.toHaveLength(MIGRATION_COUNT);
  });
});
