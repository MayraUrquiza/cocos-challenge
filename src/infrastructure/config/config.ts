import { Type, type Static, type TObject } from 'typebox';
import { Value } from 'typebox/value';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const POSTGRES_URL = { pattern: '^postgres(ql)?://' };

const AppEnvSchema = Type.Object({
  PORT: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
  HOST: Type.String({ minLength: 1, default: '0.0.0.0' }),
  LOG_LEVEL: Type.Union(
    LOG_LEVELS.map((level) => Type.Literal(level)),
    { default: 'info' },
  ),
  DATABASE_URL: Type.String(POSTGRES_URL),
  MARKET_SIMULATION_ENABLED: Type.Union([Type.Literal('true'), Type.Literal('false')], {
    default: 'false',
  }),
});

const MigrationEnvSchema = Type.Object({
  MIGRATION_DATABASE_URL: Type.String(POSTGRES_URL),
});

export interface AppConfig {
  port: number;
  host: string;
  logLevel: (typeof LOG_LEVELS)[number];
  databaseUrl: string;
  marketSimulationEnabled: boolean;
}

export interface MigrationConfig {
  migrationDatabaseUrl: string;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuración inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Configuración de la API. Falla al arrancar si falta alguna variable
 * obligatoria o si alguna tiene un valor inválido, en lugar de fallar en el
 * primer request que la use.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = parseEnv(AppEnvSchema, source);
  return {
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    marketSimulationEnabled: env.MARKET_SIMULATION_ENABLED === 'true',
  };
}

/** Configuración de las migraciones: usan el usuario con permisos de DDL. */
export function loadMigrationConfig(source: NodeJS.ProcessEnv = process.env): MigrationConfig {
  const env = parseEnv(MigrationEnvSchema, source);
  return { migrationDatabaseUrl: env.MIGRATION_DATABASE_URL };
}

function parseEnv<S extends TObject>(schema: S, source: NodeJS.ProcessEnv): Static<S> {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(schema.properties)) {
    const value = source[key];
    if (value !== undefined && value !== '') raw[key] = value;
  }

  const env = Value.Convert(schema, Value.Default(schema, raw));

  const issues = [...Value.Errors(schema, env)].flatMap((error) => {
    const missing = (error.params as { requiredProperties?: string[] }).requiredProperties;
    if (error.keyword === 'required' && missing) {
      return missing.map((key) => `${key} es obligatoria`);
    }
    return [`${error.instancePath.replace(/^\//, '') || 'env'}: ${error.message}`];
  });
  if (issues.length > 0) throw new ConfigError(issues);

  return env as Static<S>;
}
