import { PlaceOrderHandler } from './application/use-cases/commands/place-order';
import { TransferCashHandler } from './application/use-cases/commands/transfer-cash';
import { GetOrderHandler } from './application/use-cases/queries/get-order';
import { GetPortfolioHandler } from './application/use-cases/queries/get-portfolio';
import { ListOrdersHandler } from './application/use-cases/queries/list-orders';
import { SearchInstrumentsHandler } from './application/use-cases/queries/search-instruments';
import { buildApp, type App } from './infrastructure/adapters/inbound/http/app';
import { PostgresInstrumentFinder } from './infrastructure/adapters/outbound/postgres/finders/postgres-instrument-finder';
import { PostgresOrderFinder } from './infrastructure/adapters/outbound/postgres/finders/postgres-order-finder';
import { PostgresPortfolioFinder } from './infrastructure/adapters/outbound/postgres/finders/postgres-portfolio-finder';
import { PostgresPriceProvider } from './infrastructure/adapters/outbound/postgres/finders/postgres-price-provider';
import { PostgresUserFinder } from './infrastructure/adapters/outbound/postgres/finders/postgres-user-finder';
import { PostgresAccountRepository } from './infrastructure/adapters/outbound/postgres/repositories/postgres-account-repository';
import { SystemClock } from './infrastructure/adapters/outbound/system/system-clock';
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

  const instrumentFinder = new PostgresInstrumentFinder(db);
  const userFinder = new PostgresUserFinder(db);
  const orderFinder = new PostgresOrderFinder(db);
  const portfolioFinder = new PostgresPortfolioFinder(db);
  const priceProvider = new PostgresPriceProvider(db);
  const accountRepository = new PostgresAccountRepository(db);
  const clock = new SystemClock();

  app = await buildApp(
    {
      checkDatabase: () => checkDatabase(db),
      useCases: {
        searchInstruments: new SearchInstrumentsHandler(instrumentFinder),
        getOrder: new GetOrderHandler(userFinder, orderFinder),
        listOrders: new ListOrdersHandler(userFinder, orderFinder),
        getPortfolio: new GetPortfolioHandler(portfolioFinder, priceProvider),
        transferCash: new TransferCashHandler(accountRepository, instrumentFinder, clock),
        placeOrder: new PlaceOrderHandler(accountRepository, instrumentFinder, priceProvider, clock),
      },
    },
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
