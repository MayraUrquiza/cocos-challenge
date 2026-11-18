import { Type } from 'typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

export interface HealthRoutesOptions {
  checkDatabase: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsyncTypebox<HealthRoutesOptions> = async (
  app,
  { checkDatabase },
) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['operación'],
        summary: 'Estado del servicio y de la base de datos',
        response: {
          200: Type.Object({ status: Type.Literal('ok') }, { additionalProperties: false }),
          503: Type.Object(
            { status: Type.Literal('unavailable') },
            { additionalProperties: false },
          ),
        },
      },
    },
    async (request, reply) => {
      try {
        await checkDatabase();
        return reply.code(200).send({ status: 'ok' });
      } catch (err) {
        request.log.warn({ err }, 'la base de datos no responde');
        return reply.code(503).send({ status: 'unavailable' });
      }
    },
  );
};
