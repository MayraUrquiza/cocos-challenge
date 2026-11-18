import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { GetOrder } from '../../../../../application/ports/inbound/get-order';
import type { ListOrders } from '../../../../../application/ports/inbound/list-orders';
import type { SearchInstruments } from '../../../../../application/ports/inbound/search-instruments';
import { instrumentRoutes } from './instruments';
import { orderRoutes } from './orders';

export interface UseCases {
  searchInstruments: SearchInstruments;
  getOrder: GetOrder;
  listOrders: ListOrders;
}

export const v1Routes: FastifyPluginAsyncTypebox<{ useCases: UseCases }> = async (
  app,
  { useCases },
) => {
  await app.register(instrumentRoutes, { searchInstruments: useCases.searchInstruments });
  await app.register(orderRoutes, {
    getOrder: useCases.getOrder,
    listOrders: useCases.listOrders,
  });
};
