// Una zona distinta de UTC, para que el test de fechas falle si pg usara la hora local.
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { sql, type Insertable, type Kysely } from 'kysely';
import { createDatabase } from '../../../src/infrastructure/database/connection';
import {
  migrateToEmpty,
  migrateToLatest,
} from '../../../src/infrastructure/database/migrator';
import type { DB, Orders } from '../../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../../support/database';

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

  describe('datos semilla', () => {
    it('conserva las 11 órdenes con sus valores', async () => {
      const orders = await app.selectFrom('orders').selectAll().orderBy('id').execute();

      expect(orders).toHaveLength(11);
      expect(orders[0]).toMatchObject({ side: 'CASH_IN', size: '1000000.00', price: '1.00' });
      expect(orders[5]).toMatchObject({ status: 'REJECTED', rejectreason: null });
    });
  });

  describe('orders.size', () => {
    it('rechaza acciones fraccionarias', async () => {
      await expect(insertOrder({ side: 'BUY', size: '1.5' })).rejects.toThrow(
        /orders_size_whole_units_check/,
      );
      await expect(insertOrder({ side: 'SELL', size: '2.50' })).rejects.toThrow(
        /orders_size_whole_units_check/,
      );
    });

    it('admite centavos en transferencias', async () => {
      const { id } = await insertOrder({
        instrumentid: ARS,
        side: 'CASH_IN',
        size: '200000.50',
        price: '1.00',
      });

      const order = await app
        .selectFrom('orders')
        .select('size')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(order.size).toBe('200000.50');
    });
  });

  describe('valores permitidos', () => {
    it.each([
      ['side', { side: 'SHORT' }, /orders_side_check/],
      ['type', { type: 'STOP' }, /orders_type_check/],
      ['status', { status: 'PENDING' }, /orders_status_check/],
    ])('rechaza un %s inválido', async (_field, values, error) => {
      await expect(insertOrder(values)).rejects.toThrow(error);
    });

    it.each(['side', 'type', 'status'] as const)('rechaza %s nulo', async (field) => {
      await expect(insertOrder({ [field]: null as unknown as string })).rejects.toThrow(
        new RegExp(`null value in column "${field}"`),
      );
    });
  });

  describe('cantidad y precio', () => {
    it('exige cantidad y precio mayores que 0 en una orden no rechazada', async () => {
      await expect(insertOrder({ size: 0 })).rejects.toThrow(/orders_size_price_check/);
      await expect(insertOrder({ price: null })).rejects.toThrow(/orders_size_price_check/);
      await expect(insertOrder({ status: 'NEW', size: null })).rejects.toThrow(
        /orders_size_price_check/,
      );
    });

    it('admite una orden rechazada sin precio y con cantidad 0', async () => {
      await expect(
        insertOrder({
          status: 'REJECTED',
          rejectreason: 'NO_MARKET_PRICE',
          size: 0,
          price: null,
        }),
      ).resolves.toBeDefined();
    });

    it('rechaza valores negativos aunque la orden esté rechazada', async () => {
      await expect(
        insertOrder({ status: 'REJECTED', rejectreason: 'ZERO_QUANTITY', size: -1 }),
      ).rejects.toThrow(/orders_size_price_check/);
    });
  });

  describe('orders.rejectReason', () => {
    it('solo se admite en órdenes rechazadas', async () => {
      await expect(
        insertOrder({ status: 'FILLED', rejectreason: 'INSUFFICIENT_FUNDS' }),
      ).rejects.toThrow(/orders_reject_reason_check/);
    });

    it('solo admite motivos conocidos', async () => {
      await expect(
        insertOrder({ status: 'REJECTED', rejectreason: 'SIN_GANAS' }),
      ).rejects.toThrow(/orders_reject_reason_check/);
      await expect(
        insertOrder({ status: 'REJECTED', rejectreason: 'INSUFFICIENT_FUNDS' }),
      ).resolves.toBeDefined();
    });
  });

  describe('idempotencia', () => {
    const hash = 'a'.repeat(64);

    it('la clave y el hash van juntos', async () => {
      await expect(insertOrder({ idempotencykey: 'sin-hash' })).rejects.toThrow(
        /orders_idempotency_check/,
      );
    });

    it('la clave es única por usuario', async () => {
      await insertOrder({ userid: 2, idempotencykey: 'clave-1', requesthash: hash });

      await expect(
        insertOrder({ userid: 2, idempotencykey: 'clave-1', requesthash: hash }),
      ).rejects.toThrow(/orders_userid_idempotencykey_key/);
      await expect(
        insertOrder({ userid: 3, idempotencykey: 'clave-1', requesthash: hash }),
      ).resolves.toBeDefined();
    });
  });

  describe('índices únicos', () => {
    it('no admite dos precios del mismo instrumento para el mismo día', async () => {
      await expect(
        migrator
          .insertInto('marketdata')
          .values({ instrumentid: PAMP, date: '2023-07-14', close: '1.00' })
          .execute(),
      ).rejects.toThrow(/marketdata_instrumentid_date_key/);
    });

    it('no admite dos instrumentos con el mismo ticker', async () => {
      await expect(
        migrator
          .insertInto('instruments')
          .values({ ticker: 'PAMP', name: 'Otro', type: 'ACCIONES' })
          .execute(),
      ).rejects.toThrow(/instruments_ticker_key/);
    });
  });

  describe('lectura de tipos', () => {
    it('NUMERIC llega como texto, sin pérdida de precisión', async () => {
      const { id } = await insertOrder({
        status: 'REJECTED',
        rejectreason: 'INSUFFICIENT_FUNDS',
        price: '99999999.99',
      });

      const order = await app
        .selectFrom('orders')
        .select('price')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(order.price).toBe('99999999.99');
    });

    it('DATE llega como día calendario y los precios como texto', async () => {
      const price = await app
        .selectFrom('marketdata')
        .select(['date', 'close'])
        .where('instrumentid', '=', PAMP)
        .orderBy('date', 'desc')
        .executeTakeFirstOrThrow();

      expect(price).toEqual({ date: '2023-07-14', close: '925.85' });
    });

    it('orders.datetime se lee como el instante guardado', async () => {
      const order = await app
        .selectFrom('orders')
        .select('datetime')
        .where('id', '=', 1)
        .executeTakeFirstOrThrow();

      expect(order.datetime?.toISOString()).toBe('2023-07-12T12:11:20.000Z');
    });

    it('orders.datetime se escribe como el instante recibido', async () => {
      const { id } = await insertOrder({ datetime: new Date('2026-11-17T14:02:11.000Z') });

      const { stored } = await sql<{ stored: string }>`
        SELECT (datetime AT TIME ZONE 'UTC')::text AS stored FROM orders WHERE id = ${id}
      `
        .execute(migrator)
        .then((result) => result.rows[0]!);
      expect(stored).toBe('2026-11-17 14:02:11');
    });
  });

  it('unaccent ignora tildes', async () => {
    const { rows } = await sql<{ value: string }>`
      SELECT unaccent('Molinos Río de la Plata') AS value
    `.execute(app);

    expect(rows[0]!.value).toBe('Molinos Rio de la Plata');
  });

  describe('permisos del usuario de la aplicación', () => {
    it('puede leer las tablas del challenge', async () => {
      await expect(app.selectFrom('users').selectAll().execute()).resolves.toHaveLength(4);
      await expect(app.selectFrom('instruments').selectAll().execute()).resolves.not.toHaveLength(0);
      await expect(app.selectFrom('marketdata').selectAll().execute()).resolves.not.toHaveLength(0);
    });

    it('todavía no puede escribir', async () => {
      await expect(
        app.updateTable('orders').set({ status: 'CANCELLED' }).where('id', '=', 5).execute(),
      ).rejects.toThrow(/permission denied/);
    });

    it('no puede modificar el esquema', async () => {
      await expect(sql`ALTER TABLE orders ADD COLUMN x INT`.execute(app)).rejects.toThrow(
        /must be owner/,
      );
    });
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

  async function columnType(column: 'size' | 'datetime'): Promise<string> {
    const { rows } = await sql<{ type: string }>`
      SELECT data_type AS type FROM information_schema.columns
      WHERE table_name = 'orders' AND column_name = ${column}
    `.execute(migrator);
    return rows[0]!.type;
  }

  /** Fecha y hora UTC de la primera orden semilla, sea TIMESTAMP o TIMESTAMPTZ. */
  async function firstOrderUtc(): Promise<string> {
    const utc =
      (await columnType('datetime')) === 'timestamp with time zone'
        ? sql`(datetime AT TIME ZONE 'UTC')::text`
        : sql`datetime::text`;
    const { rows } = await sql<{ value: string }>`
      SELECT ${utc} AS value FROM orders WHERE id = 1
    `.execute(migrator);
    return rows[0]!.value;
  }

  it('se aplican sobre la base semilla y se pueden volver a ejecutar', async () => {
    expect(await firstOrderUtc()).toBe('2023-07-12 12:11:20');

    const first = await migrateToLatest(migrator);
    const second = await migrateToLatest(migrator);

    expect(first.map((result) => result.status)).toEqual(['Success', 'Success', 'Success', 'Success']);
    expect(second).toEqual([]);
    expect(await columnType('size')).toBe('numeric');
    expect(await columnType('datetime')).toBe('timestamp with time zone');
  });

  it('pasar a TIMESTAMPTZ conserva el instante de las órdenes semilla', async () => {
    expect(await firstOrderUtc()).toBe('2023-07-12 12:11:20');
  });

  it('se pueden revertir y volver a aplicar', async () => {
    const reverted = await migrateToEmpty(migrator);
    expect(reverted).toHaveLength(4);
    expect(await columnType('size')).toBe('integer');
    expect(await columnType('datetime')).toBe('timestamp without time zone');
    expect(await firstOrderUtc()).toBe('2023-07-12 12:11:20');

    await expect(migrateToLatest(migrator)).resolves.toHaveLength(4);
  });
});
