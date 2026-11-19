import type { Kysely } from 'kysely';
import { buildApp, type App } from '../../src/infrastructure/adapters/inbound/http/app';
import { checkDatabase, createDatabase } from '../../src/infrastructure/database/connection';
import type { DB } from '../../src/infrastructure/database/schema';
import { testDatabaseUrl } from '../support/env';
import { stubUseCases } from '../support/use-cases';

describe('GET /health contra PostgreSQL', () => {
  let db: Kysely<DB>;
  let app: App;

  afterEach(async () => {
    await app.close();
    await db.destroy();
  });

  it('responde 200 con la base levantada', async () => {
    db = createDatabase(testDatabaseUrl());
    app = await buildApp({ checkDatabase: () => checkDatabase(db), useCases: stubUseCases() });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('responde 503 si la base no es alcanzable', async () => {
    db = createDatabase('postgres://cocos_app:cocos_app@127.0.0.1:1/cocos');
    app = await buildApp({ checkDatabase: () => checkDatabase(db), useCases: stubUseCases() });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
  });
});
