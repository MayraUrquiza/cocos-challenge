import { pino } from 'pino';
import { ReconcileAccountsHandler } from './application/use-cases/queries/reconcile-accounts';
import { PostgresAccountEventsFinder } from './infrastructure/adapters/outbound/postgres/finders/postgres-account-events-finder';
import { ConfigError, loadConfig } from './infrastructure/config/config';
import { loadDotEnv } from './infrastructure/config/dotenv';
import { createDatabase } from './infrastructure/database/connection';

/**
 * Reconciliación entre `orders` y el historial contable: `npm run reconcile`
 * (ADR-0003, punto 2). Es un proceso aparte de la API, con su propio
 * composition root, pensado para correr como control periódico.
 *
 * Loguea una línea por cuenta con diferencias y un resumen con la métrica
 * `accountsWithDifferences`, cuyo objetivo es 0. Si hay diferencias, termina
 * con código 1 para que el programador de tareas lo marque como fallido.
 */
async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const db = createDatabase(config.databaseUrl);

  try {
    const report = await new ReconcileAccountsHandler(new PostgresAccountEventsFinder(db)).execute();

    const { accountsChecked, accountsWithDifferences } = report;
    for (const { accountId, differences } of accountsWithDifferences) {
      logger.error({ accountId, differences }, 'la cuenta no coincide entre orders y account_events');
    }
    logger.info(
      { accountsChecked, accountsWithDifferences: accountsWithDifferences.length },
      'reconciliación terminada',
    );
    process.exitCode = accountsWithDifferences.length === 0 ? 0 : 1;
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
