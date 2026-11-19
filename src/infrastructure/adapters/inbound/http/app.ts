import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { registerErrorHandling } from './errors/error-handler';
import { ErrorResponseSchema } from './errors/error-response';
import { genCorrelationId, registerRequestLogging } from './request-logging';
import { exactlyOneOfKeyword } from './schemas/exactly-one-of';
import { maxDecimalsKeyword } from './schemas/max-decimals';
import { healthRoutes } from './routes/health';
import { v1Routes, type UseCases } from './routes/v1';

/** Las convenciones que aplican a todas las rutas (ADR-0005). */
const API_DESCRIPTION = `
Portfolio de un usuario, búsqueda de instrumentos, envío, consulta y cancelación de órdenes, y transferencias de pesos.

- **Un \`201\` puede ser un rechazo.** Una orden o transferencia bien armada que no cumple una regla de negocio se guarda con \`status: REJECTED\` y su \`rejectReason\`. Revisar siempre \`status\`.
- **Montos y cantidades viajan como texto** en las respuestas (\`"925.85"\`, \`"40"\`), para no perder precisión. En los requests se envían como número.
- **Errores** con la forma \`{ statusCode, error, code, message, details? }\`. El \`code\` es estable, el \`message\` puede cambiar.
- **Reintentos seguros:** las rutas que crean órdenes aceptan el header \`Idempotency-Key\`.
- **Fechas** en ISO 8601 UTC. El \`datetime\` de una orden es su último cambio de estado.
- **Correlación:** cada respuesta trae \`x-correlation-id\`, el mismo que aparece en los logs. Se puede enviar uno propio.

El diseño y sus decisiones están en el RFC-001 y los ADR-0001 a ADR-0005 del repositorio (\`docs/\`).
`.trim();

export interface AppDependencies {
  checkDatabase: () => Promise<void>;
  useCases: UseCases;
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  marketSimulationEnabled?: boolean;
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
        discriminator: true,
      },
      plugins: [maxDecimalsKeyword, exactlyOneOfKeyword],
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
        description: API_DESCRIPTION,
      },
      tags: [
        { name: 'portfolio', description: 'Valor, pesos y posiciones de un usuario.' },
        { name: 'instrumentos', description: 'Búsqueda de acciones.' },
        { name: 'órdenes', description: 'Envío, consulta y cancelación de órdenes.' },
        { name: 'transferencias', description: 'Ingresos y retiros de pesos.' },
        { name: 'simulación', description: 'Ejecución de órdenes LIMIT, solo para pruebas.' },
        { name: 'operación', description: 'Estado del servicio.' },
      ],
    },
    // Los schemas compartidos aparecen con su nombre (ErrorResponse) y no como def-0.
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) =>
        typeof json.$id === 'string' ? json.$id : `def-${i}`,
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes, { checkDatabase: deps.checkDatabase });
  await app.register(v1Routes, {
    prefix: '/v1',
    useCases: deps.useCases,
    marketSimulationEnabled: options.marketSimulationEnabled ?? false,
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
