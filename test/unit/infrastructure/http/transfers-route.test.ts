import type { TransferCash } from '../../../../src/application/ports/inbound/transfer-cash';
import { Money } from '../../../../src/domain/shared/money';
import { Quantity } from '../../../../src/domain/shared/quantity';
import { buildApp, type App } from '../../../../src/infrastructure/adapters/inbound/http/app';
import { anOrder } from '../../../support/orders';
import { stubUseCases } from '../../../support/use-cases';

describe('POST /v1/users/{userId}/transfers: validación', () => {
  let app: App;
  let transferCash: jest.MockedFunction<TransferCash['execute']>;

  beforeEach(async () => {
    transferCash = jest.fn<ReturnType<TransferCash['execute']>, Parameters<TransferCash['execute']>>().mockResolvedValue({
      order: anOrder({ side: 'CASH_IN', instrumentId: 66, size: Quantity.of('0.29', 2), price: Money.of('1') }),
      replayed: false,
    });
    app = await buildApp({
      checkDatabase: async () => {},
      useCases: stubUseCases({ transferCash: { execute: transferCash } }),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (payload: object) =>
    app.inject({ method: 'POST', url: '/v1/users/2/transfers', payload });

  it('un monto con más de 2 decimales responde 400 y no registra nada', async () => {
    const response = await post({ type: 'CASH_IN', amount: 1.005 });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'amount', message: 'amount debe tener como máximo 2 decimales' }],
    });
    expect(transferCash).not.toHaveBeenCalled();
  });

  it('un campo no declarado responde 400 en lugar de descartarse', async () => {
    const response = await post({ type: 'CASH_IN', amount: 10, userId: 1 });

    expect(response.statusCode).toBe(400);
    expect(response.json().details).toEqual([
      { field: 'userId', message: 'userId no es un campo permitido' },
    ]);
  });

  it('acepta montos con 2 decimales que fallarían con multipleOf, como 0.29', async () => {
    const response = await post({ type: 'CASH_IN', amount: 0.29 });

    expect(response.statusCode).toBe(201);
    expect(transferCash.mock.calls[0]![0].amount.toString()).toBe('0.29');
  });
});
