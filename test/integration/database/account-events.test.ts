import { sql, type Kysely } from 'kysely';
import { backfillLegacyOrders } from '../../../src/infrastructure/database/backfill/legacy-orders';
import { createDatabase } from '../../../src/infrastructure/database/connection';
import type { DB } from '../../../src/infrastructure/database/schema';
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

  const eventsOf = (accountId: number) =>
    migrator
      .selectFrom('account_events')
      .selectAll()
      .where('account_id', '=', accountId)
      .orderBy('sequence')
      .execute();

  it('carga un LegacyOrderImported por orden semilla, en orden y con su estado final', async () => {
    const events = await eventsOf(1);

    expect(events.map((event) => [event.sequence, event.order_id])).toEqual(
      Array.from({ length: 11 }, (_, index) => [index + 1, index + 1]),
    );
    expect(events.every((event) => event.event_type === 'LegacyOrderImported')).toBe(true);
    expect(events[0]!.metadata).toEqual({ source: 'backfill' });
    // La orden 3 se canceló: se carga solo su estado final, sin inventar pasos.
    expect(events[2]!.payload).toMatchObject({ orderId: 3, status: 'CANCELLED' });
  });

  it('la carga es idempotente: ejecutarla de nuevo no duplica eventos', async () => {
    await expect(backfillLegacyOrders(migrator)).resolves.toBe(0);
    await expect(eventsOf(1)).resolves.toHaveLength(11);
  });

  it('UPDATE, DELETE y TRUNCATE fallan, incluso para el dueño de la tabla', async () => {
    await expect(
      migrator.updateTable('account_events').set({ event_type: 'OrderCancelled' }).execute(),
    ).rejects.toThrow(/account_events es inmutable: UPDATE/);
    await expect(migrator.deleteFrom('account_events').execute()).rejects.toThrow(
      /account_events es inmutable: DELETE/,
    );
    await expect(sql`TRUNCATE account_events`.execute(migrator)).rejects.toThrow(
      /account_events es inmutable: TRUNCATE/,
    );
  });

  it('la aplicación solo puede leer y agregar eventos', async () => {
    await expect(app.selectFrom('account_events').select('id').execute()).resolves.not.toHaveLength(0);
    await expect(
      app.deleteFrom('account_events').where('sequence', '=', 1).execute(),
    ).rejects.toThrow(/permission denied/);
    await expect(sql`ALTER TABLE account_events DISABLE TRIGGER ALL`.execute(app)).rejects.toThrow(
      /must be owner/,
    );
  });
});
