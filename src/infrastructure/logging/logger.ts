import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from '../config/config';

export function loggerOptions(level: AppConfig['logLevel']): FastifyServerOptions['logger'] {
  return { level };
}
