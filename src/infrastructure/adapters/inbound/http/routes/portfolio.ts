import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { GetPortfolio } from '../../../../../application/ports/inbound/get-portfolio';
import { toPortfolioResponse } from '../mappers/portfolio-response';
import { PortfolioParams, PortfolioResponse } from '../schemas/portfolio';

export interface PortfolioRoutesOptions {
  getPortfolio: GetPortfolio;
}

const ErrorResponse = { $ref: 'ErrorResponse#' };

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
        response: { 200: PortfolioResponse, 400: ErrorResponse, 404: ErrorResponse },
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
