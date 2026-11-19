import type { GetPortfolio } from '../../../../src/application/ports/inbound/get-portfolio';
import { UserNotFoundError } from '../../../../src/application/shared/errors';
import { projectPortfolio } from '../../../../src/domain/portfolio/project-portfolio';
import { buildApp, type App } from '../../../../src/infrastructure/adapters/inbound/http/app';
import { seedEvents, seedInstruments, seedPrices } from '../../../support/seed-account';
import { stubUseCases } from '../../../support/use-cases';

describe('GET /v1/users/{userId}/portfolio', () => {
  let app: App;
  let getPortfolio: jest.MockedFunction<GetPortfolio['execute']>;
  let logs: string[];

  beforeEach(async () => {
    getPortfolio = jest.fn();
    logs = [];
    app = await buildApp(
      { checkDatabase: async () => {}, useCases: stubUseCases({ getPortfolio: { execute: getPortfolio } }) },
      { logger: { level: 'warn', stream: { write: (line: string) => logs.push(line) } } },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('responde el portfolio con montos, cantidades y porcentajes como texto', async () => {
    getPortfolio.mockResolvedValue({
      userId: 1,
      accountNumber: '10001',
      ...projectPortfolio({ events: seedEvents, instruments: seedInstruments, prices: seedPrices }),
    });

    const response = await get('/v1/users/1/portfolio');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      userId: 1,
      accountNumber: '10001',
      totalValue: '889756.00',
      cash: { total: '753000.00', reserved: '125500.00', available: '627500.00' },
      warnings: ['NEGATIVE_QUANTITY'],
    });
    expect(body.positions).toContainEqual({
      instrumentId: 47,
      ticker: 'PAMP',
      name: 'Pampa Holding S.A.',
      quantity: '40',
      avgCostPrice: '930.00',
      lastPrice: '925.85',
      marketValue: '37034.00',
      gain: '-166.00',
      returnPct: '-0.45',
      dailyReturnPct: '0.44',
      warnings: [],
    });
    expect(getPortfolio).toHaveBeenCalledWith({ userId: 1 });
  });

  it('registra las anomalías en el log', async () => {
    getPortfolio.mockResolvedValue({
      userId: 1,
      accountNumber: '10001',
      ...projectPortfolio({ events: seedEvents, instruments: seedInstruments, prices: seedPrices }),
    });

    await get('/v1/users/1/portfolio');

    const warning = logs.map((line) => JSON.parse(line)).find((entry) => entry.msg === 'portfolio con anomalías');
    expect(warning).toMatchObject({
      userId: 1,
      anomalies: [{ ticker: 'BMA', quantity: '-10', warnings: ['NEGATIVE_QUANTITY'] }],
    });
  });

  it('un usuario inexistente responde 404 USER_NOT_FOUND', async () => {
    getPortfolio.mockRejectedValue(new UserNotFoundError(999));

    const response = await get('/v1/users/999/portfolio');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('un userId inválido responde 400', async () => {
    const response = await get('/v1/users/abc/portfolio');

    expect(response.statusCode).toBe(400);
    expect(getPortfolio).not.toHaveBeenCalled();
  });
});
