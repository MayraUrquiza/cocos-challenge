import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { GetOrder } from '../../../../../application/ports/inbound/get-order';
import type { GetPortfolio } from '../../../../../application/ports/inbound/get-portfolio';
import type { ListOrders } from '../../../../../application/ports/inbound/list-orders';
import type { PlaceOrder } from '../../../../../application/ports/inbound/place-order';
import type { SearchInstruments } from '../../../../../application/ports/inbound/search-instruments';
import type { TransferCash } from '../../../../../application/ports/inbound/transfer-cash';
import { instrumentRoutes } from './instruments';
import { orderRoutes } from './orders';
import { portfolioRoutes } from './portfolio';
import { transferRoutes } from './transfers';

export interface UseCases {
  searchInstruments: SearchInstruments;
  getOrder: GetOrder;
  listOrders: ListOrders;
  getPortfolio: GetPortfolio;
  transferCash: TransferCash;
  placeOrder: PlaceOrder;
}

export const v1Routes: FastifyPluginAsyncTypebox<{ useCases: UseCases }> = async (
  app,
  { useCases },
) => {
  await app.register(instrumentRoutes, { searchInstruments: useCases.searchInstruments });
  await app.register(orderRoutes, {
    getOrder: useCases.getOrder,
    listOrders: useCases.listOrders,
    placeOrder: useCases.placeOrder,
  });
  await app.register(portfolioRoutes, { getPortfolio: useCases.getPortfolio });
  await app.register(transferRoutes, { transferCash: useCases.transferCash });
};
