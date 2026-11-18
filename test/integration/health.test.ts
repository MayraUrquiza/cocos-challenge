import { sql, type Kysely } from 'kysely';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { checkDatabase, createDatabase } from '../../src/infrastructure/database/connection';
import { testDatabaseUrl } from '../support/env';

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout esperando la condición');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('GET /health contra PostgreSQL', () => {
  let db: Kysely<Record<string, never>>;
  let app: App;

  afterEach(async () => {
    await app.close();
    await db.destroy();
  });

  it('responde 200 con la base levantada, conectando con el usuario de la aplicación', async () => {
    db = createDatabase(testDatabaseUrl());
    app = await buildApp({ checkDatabase: () => checkDatabase(db) });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('sobrevive a que la base corte una conexión inactiva y se recupera', async () => {
    const idleErrors: Error[] = [];
    db = createDatabase(testDatabaseUrl(), (err) => idleErrors.push(err));
    app = await buildApp({ checkDatabase: () => checkDatabase(db) });
    await app.inject({ method: 'GET', url: '/health' });

    // Otra conexión del mismo usuario corta las del pool, como en un reinicio de la base.
    const killer = createDatabase(testDatabaseUrl());
    await sql`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE usename = current_user AND pid <> pg_backend_pid()
    `.execute(killer);
    await killer.destroy();
    await waitFor(() => idleErrors.length > 0);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(idleErrors.length).toBeGreaterThan(0);
    expect(response.statusCode).toBe(200);
  });

  it('responde 503 si la base no es alcanzable', async () => {
    db = createDatabase('postgres://cocos_app:cocos_app@127.0.0.1:1/cocos');
    app = await buildApp({ checkDatabase: () => checkDatabase(db) });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
  });
});
