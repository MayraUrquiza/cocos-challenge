import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { SearchInstruments } from '../../../../../application/ports/inbound/search-instruments';
import { toSearchInstrumentsResponse } from '../mappers/instrument-response';
import { SearchInstrumentsQuerystring, SearchInstrumentsResponse } from '../schemas/instruments';
import { described, ValidationError } from '../schemas/responses';

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
          200: described(
            SearchInstrumentsResponse,
            'Una página de instrumentos con su último precio, o `null` si no tiene precios.',
          ),
          400: ValidationError,
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
