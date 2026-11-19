import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { CancelOrder } from '../../../../../application/ports/inbound/cancel-order';
import type { FillOrder } from '../../../../../application/ports/inbound/fill-order';
import type { GetOrder } from '../../../../../application/ports/inbound/get-order';
import type { GetPortfolio } from '../../../../../application/ports/inbound/get-portfolio';
import type { ListOrders } from '../../../../../application/ports/inbound/list-orders';
import type { PlaceOrder } from '../../../../../application/ports/inbound/place-order';
import type { SearchInstruments } from '../../../../../application/ports/inbound/search-instruments';
import type { TransferCash } from '../../../../../application/ports/inbound/transfer-cash';
import { instrumentRoutes } from './instruments';
import { orderRoutes } from './orders';
import { portfolioRoutes } from './portfolio';
import { simulationRoutes } from './simulation';
import { transferRoutes } from './transfers';

export interface UseCases {
  searchInstruments: SearchInstruments;
  getOrder: GetOrder;
  listOrders: ListOrders;
  getPortfolio: GetPortfolio;
  transferCash: TransferCash;
  placeOrder: PlaceOrder;
  cancelOrder: CancelOrder;
  fillOrder: FillOrder;
}

export interface V1RoutesOptions {
  useCases: UseCases;
  marketSimulationEnabled: boolean;
}

export const v1Routes: FastifyPluginAsyncTypebox<V1RoutesOptions> = async (
  app,
  { useCases, marketSimulationEnabled },
) => {
  await app.register(instrumentRoutes, { searchInstruments: useCases.searchInstruments });
  await app.register(orderRoutes, {
    getOrder: useCases.getOrder,
    listOrders: useCases.listOrders,
    placeOrder: useCases.placeOrder,
    cancelOrder: useCases.cancelOrder,
  });
  await app.register(portfolioRoutes, { getPortfolio: useCases.getPortfolio });
  await app.register(transferRoutes, { transferCash: useCases.transferCash });
  if (marketSimulationEnabled) {
    await app.register(simulationRoutes, { fillOrder: useCases.fillOrder });
  }
};
