import { sql, type Insertable, type Kysely } from 'kysely';
import { backfillLegacyOrders } from '../../../src/infrastructure/database/backfill/legacy-orders';
import { createDatabase } from '../../../src/infrastructure/database/connection';
import type { AccountEvents, DB } from '../../../src/infrastructure/database/schema';
import { createTestDatabase, type TestDatabase } from '../../support/database';

describe('historial contable (account_events)', () => {
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

  function eventsOf(accountId: number) {
    return migrator
      .selectFrom('account_events')
      .selectAll()
      .where('account_id', '=', accountId)
      .orderBy('sequence')
      .execute();
  }

  function insertEvent(values: Partial<Insertable<AccountEvents>> = {}) {
    return migrator
      .insertInto('account_events')
      .values({
        account_id: 1,
        sequence: 999,
        event_type: 'OrderFilled',
        event_version: 1,
        order_id: 1,
        payload: JSON.stringify({}),
        occurred_at: new Date(),
        ...values,
      })
      .execute();
  }

  describe('carga de las órdenes semilla', () => {
    it('carga un evento por orden, en orden de (datetime, id)', async () => {
      const events = await eventsOf(1);

      expect(events).toHaveLength(11);
      expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(events.map((event) => event.order_id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('cada evento es un LegacyOrderImported marcado como backfill, con el instante de la orden', async () => {
      const [first] = await eventsOf(1);

      expect(first).toMatchObject({
        event_type: 'LegacyOrderImported',
        event_version: 1,
        metadata: { source: 'backfill' },
      });
      expect(first!.occurred_at.toISOString()).toBe('2023-07-12T12:11:20.000Z');
      expect(first!.event_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('guarda la fila completa con su estado final y los montos como texto', async () => {
      const events = await eventsOf(1);

      expect(events[0]!.payload).toEqual({
        orderId: 1,
        userId: 1,
        instrumentId: 66,
        side: 'CASH_IN',
        type: 'MARKET',
        size: '1000000.00',
        price: '1.00',
        status: 'FILLED',
        rejectReason: null,
        datetime: '2023-07-12T12:11:20+00:00',
      });
      // La orden 3 se canceló: se carga solo su estado final, sin inventar pasos.
      expect(events[2]!.payload).toMatchObject({ orderId: 3, status: 'CANCELLED' });
    });

    it('las cuentas sin órdenes no tienen eventos', async () => {
      await expect(eventsOf(2)).resolves.toEqual([]);
    });
  });

  describe('backfill', () => {
    it('es idempotente: ejecutarlo de nuevo no duplica eventos', async () => {
      await expect(backfillLegacyOrders(migrator)).resolves.toBe(0);
      await expect(eventsOf(1)).resolves.toHaveLength(11);
    });

    it('continúa la secuencia de cada cuenta para órdenes sin eventos', async () => {
      const values = {
        instrumentid: 66,
        side: 'CASH_IN',
        type: 'MARKET',
        status: 'FILLED',
        size: '100.00',
        price: '1.00',
        datetime: new Date('2026-11-18T10:00:00Z'),
      };
      await migrator.insertInto('orders').values({ ...values, userid: 1 }).execute();
      await migrator.insertInto('orders').values({ ...values, userid: 2 }).execute();

      await expect(backfillLegacyOrders(migrator)).resolves.toBe(2);

      expect((await eventsOf(1)).at(-1)!.sequence).toBe(12);
      expect((await eventsOf(2)).map((event) => event.sequence)).toEqual([1]);
    });
  });

  describe('inmutabilidad', () => {
    // Se prueba con el dueño de la tabla: los triggers lo frenan aunque tenga todos los permisos.
    it('rechaza UPDATE', async () => {
      await expect(
        migrator
          .updateTable('account_events')
          .set({ event_type: 'OrderCancelled' })
          .where('sequence', '=', 1)
          .execute(),
      ).rejects.toThrow(/account_events es inmutable: UPDATE no está permitido/);
    });

    it('rechaza DELETE', async () => {
      await expect(
        migrator.deleteFrom('account_events').where('sequence', '=', 1).execute(),
      ).rejects.toThrow(/account_events es inmutable: DELETE no está permitido/);
    });

    it('rechaza TRUNCATE', async () => {
      await expect(sql`TRUNCATE account_events`.execute(migrator)).rejects.toThrow(
        /account_events es inmutable: TRUNCATE no está permitido/,
      );
    });

    it('los eventos siguen intactos', async () => {
      const [first] = await eventsOf(1);
      expect(first!.event_type).toBe('LegacyOrderImported');
    });
  });

  describe('controles', () => {
    it('no admite dos eventos con la misma posición en una cuenta', async () => {
      await expect(insertEvent({ account_id: 1, sequence: 1 })).rejects.toThrow(
        /account_events_account_id_sequence_key/,
      );
    });

    it('no admite tipos de evento desconocidos', async () => {
      await expect(insertEvent({ event_type: 'OrderTeleported' })).rejects.toThrow(
        /account_events_event_type_check/,
      );
    });

    it('no admite eventos de órdenes o cuentas inexistentes', async () => {
      await expect(insertEvent({ order_id: 999_999 })).rejects.toThrow(/foreign key/);
      await expect(insertEvent({ account_id: 999_999 })).rejects.toThrow(/foreign key/);
    });
  });

  describe('permisos del usuario de la aplicación', () => {
    it('puede leer el historial', async () => {
      await expect(
        app.selectFrom('account_events').select('id').execute(),
      ).resolves.not.toHaveLength(0);
    });

    it('puede agregar eventos', async () => {
      await expect(
        app
          .insertInto('account_events')
          .values({
            account_id: 1,
            sequence: 500,
            event_type: 'OrderFilled',
            event_version: 1,
            order_id: 1,
            payload: JSON.stringify({}),
            occurred_at: new Date(),
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      ).resolves.toHaveProperty('id');
    });

    it('no puede modificar ni borrar eventos, ni la tabla', async () => {
      await expect(
        app.updateTable('account_events').set({ event_version: 2 }).execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(
        app.deleteFrom('account_events').where('sequence', '=', 1).execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(
        sql`ALTER TABLE account_events DISABLE TRIGGER ALL`.execute(app),
      ).rejects.toThrow(/must be owner/);
    });
  });
});
