import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvSchema = Type.Object({
  PORT: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
  HOST: Type.String({ minLength: 1, default: '0.0.0.0' }),
  LOG_LEVEL: Type.Union(
    LOG_LEVELS.map((level) => Type.Literal(level)),
    { default: 'info' },
  ),
  DATABASE_URL: Type.String({ pattern: '^postgres(ql)?://' }),
  MARKET_SIMULATION_ENABLED: Type.Union([Type.Literal('true'), Type.Literal('false')], {
    default: 'false',
  }),
});

type Env = Static<typeof EnvSchema>;

export interface AppConfig {
  port: number;
  host: string;
  logLevel: (typeof LOG_LEVELS)[number];
  databaseUrl: string;
  marketSimulationEnabled: boolean;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuración inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Lee y valida las variables de entorno. Falla al arrancar si falta alguna
 * obligatoria o si alguna tiene un valor inválido, en lugar de fallar en el
 * primer request que la use.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(EnvSchema.properties)) {
    const value = source[key];
    if (value !== undefined && value !== '') raw[key] = value;
  }

  const env = Value.Convert(EnvSchema, Value.Default(EnvSchema, raw));

  const issues = [...Value.Errors(EnvSchema, env)].flatMap((error) => {
    const missing = (error.params as { requiredProperties?: string[] }).requiredProperties;
    if (error.keyword === 'required' && missing) {
      return missing.map((key) => `${key} es obligatoria`);
    }
    return [`${error.instancePath.replace(/^\//, '') || 'env'}: ${error.message}`];
  });
  if (issues.length > 0) throw new ConfigError(issues);

  const valid = env as Env;
  return {
    port: valid.PORT,
    host: valid.HOST,
    logLevel: valid.LOG_LEVEL,
    databaseUrl: valid.DATABASE_URL,
    marketSimulationEnabled: valid.MARKET_SIMULATION_ENABLED === 'true',
  };
}
