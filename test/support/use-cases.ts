import type { UseCases } from '../../src/infrastructure/adapters/inbound/http/routes/v1';

function notStubbed(name: string) {
  return {
    execute: () => Promise.reject(new Error(`${name} no está preparado en este test`)),
  };
}

/**
 * Casos de uso para tests HTTP. Los que el test no reemplaza fallan si se los
 * llama, así un test no depende sin querer de uno que no preparó.
 */
export function stubUseCases(overrides: Partial<UseCases> = {}): UseCases {
  return {
    searchInstruments: notStubbed('searchInstruments'),
    getOrder: notStubbed('getOrder'),
    listOrders: notStubbed('listOrders'),
    getPortfolio: notStubbed('getPortfolio'),
    transferCash: notStubbed('transferCash'),
    ...overrides,
  };
}
