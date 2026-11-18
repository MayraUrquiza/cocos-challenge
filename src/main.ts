import { buildApp, type App } from './infrastructure/adapters/inbound/http/app';
import { ConfigError, loadConfig } from './infrastructure/config/config';
import { loadDotEnv } from './infrastructure/config/dotenv';
import { checkDatabase, createDatabase } from './infrastructure/database/connection';
import { loggerOptions } from './infrastructure/logging/logger';

/** Composition root: el único lugar donde se construyen los adaptadores y se pasan a quien los usa. */
async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();

  let app: App | undefined;
  const db = createDatabase(config.databaseUrl, (err) => {
    app?.log.warn({ err }, 'la base cerró una conexión inactiva');
  });

  app = await buildApp(
    { checkDatabase: () => checkDatabase(db) },
    { logger: loggerOptions(config.logLevel) },
  );
  app.addHook('onClose', async () => {
    await db.destroy();
  });

  const server = app;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.log.info({ signal }, 'cerrando el servicio');
      server.close().then(
        () => process.exit(0),
        (err: unknown) => {
          server.log.error({ err }, 'error al cerrar el servicio');
          process.exit(1);
        },
      );
    });
  }

  await server.listen({ port: config.port, host: config.host });
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
