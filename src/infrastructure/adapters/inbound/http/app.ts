import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { registerErrorHandling } from './errors/error-handler';
import { ErrorResponseSchema } from './errors/error-response';
import { genCorrelationId, registerRequestLogging } from './request-logging';
import { healthRoutes } from './routes/health';
import { v1Routes, type UseCases } from './routes/v1';

export interface AppDependencies {
  checkDatabase: () => Promise<void>;
  useCases: UseCases;
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
}

/**
 * Arma la aplicación sin abrir un puerto. main.ts la pone a escuchar, y los
 * tests la usan con inject().
 */
export async function buildApp(deps: AppDependencies, options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: genCorrelationId,
    logController: new LogController({
      requestIdLogLabel: 'correlationId',
      disableRequestLogging: true,
    }),
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: 'array',
        useDefaults: true,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  registerErrorHandling(app);
  registerRequestLogging(app);

  app.addSchema(ErrorResponseSchema);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'API de Portfolio, Búsqueda y Órdenes',
        version: '1.0.0',
        description: 'Ver docs/rfc/RFC-001-api-portfolio-busqueda-ordenes.md',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes, { checkDatabase: deps.checkDatabase });
  await app.register(v1Routes, { prefix: '/v1', useCases: deps.useCases });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
