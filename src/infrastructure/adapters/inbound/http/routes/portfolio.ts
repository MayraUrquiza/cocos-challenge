import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { GetPortfolio } from '../../../../../application/ports/inbound/get-portfolio';
import { toPortfolioResponse } from '../mappers/portfolio-response';
import { PortfolioParams, PortfolioResponse } from '../schemas/portfolio';
import { described, errorResponse, ValidationError } from '../schemas/responses';

export interface PortfolioRoutesOptions {
  getPortfolio: GetPortfolio;
}

export const portfolioRoutes: FastifyPluginAsyncTypebox<PortfolioRoutesOptions> = async (
  app,
  { getPortfolio },
) => {
  app.get(
    '/users/:userId/portfolio',
    {
      schema: {
        tags: ['portfolio'],
        summary: 'Portfolio del usuario',
        description:
          'Valor total, pesos (total, reservados y disponibles) y posiciones con su rendimiento. ' +
          'Revisar `warnings`: una posición puede tener tenencia negativa o no tener precios.',
        params: PortfolioParams,
        response: {
          200: described(PortfolioResponse, 'El portfolio. Un usuario sin órdenes lo tiene vacío, con ceros.'),
          400: ValidationError,
          404: errorResponse('`USER_NOT_FOUND`: el usuario no existe.'),
        },
      },
    },
    async (request) => {
      const portfolio = await getPortfolio.execute(request.params);

      const anomalies = portfolio.positions.filter((position) => position.warnings.length > 0);
      if (anomalies.length > 0) {
        request.log.warn(
          {
            userId: portfolio.userId,
            anomalies: anomalies.map((position) => ({
              ticker: position.instrument.ticker,
              quantity: position.quantity.toString(),
              warnings: position.warnings,
            })),
          },
          'portfolio con anomalías',
        );
      }

      return toPortfolioResponse(portfolio);
    },
  );
};
