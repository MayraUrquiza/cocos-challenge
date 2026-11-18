import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { SearchInstruments } from '../../../../../application/ports/inbound/search-instruments';
import { instrumentRoutes } from './instruments';

export interface UseCases {
  searchInstruments: SearchInstruments;
}

export const v1Routes: FastifyPluginAsyncTypebox<{ useCases: UseCases }> = async (
  app,
  { useCases },
) => {
  await app.register(instrumentRoutes, { searchInstruments: useCases.searchInstruments });
};
