import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { SearchInstruments } from '../../../../../application/ports/inbound/search-instruments';
import { toSearchInstrumentsResponse } from '../mappers/instrument-response';
import { SearchInstrumentsQuerystring, SearchInstrumentsResponse } from '../schemas/instruments';

export interface InstrumentRoutesOptions {
  searchInstruments: SearchInstruments;
}

export const instrumentRoutes: FastifyPluginAsyncTypebox<InstrumentRoutesOptions> = async (
  app,
  { searchInstruments },
) => {
  app.get(
    '/instruments',
    {
      schema: {
        tags: ['instrumentos'],
        summary: 'Busca acciones por ticker o nombre',
        description:
          'Primero el ticker exacto, después los tickers que empiezan con `q` y después el resto. No incluye `ARS`.',
        querystring: SearchInstrumentsQuerystring,
        response: {
          200: SearchInstrumentsResponse,
          400: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request) => {
      const { q, limit, offset } = request.query;
      const page = await searchInstruments.execute({ text: q, limit, offset });
      return toSearchInstrumentsResponse(page);
    },
  );
};
