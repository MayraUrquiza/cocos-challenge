import { buildApp, type App } from '../../../../src/infrastructure/adapters/inbound/http/app';
import { stubUseCases } from '../../../support/use-cases';

describe('formato de errores', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildApp({ checkDatabase: async () => {}, useCases: stubUseCases() });
    app.get('/test/boom', async () => {
      throw new Error('detalle interno secreto');
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('una ruta inexistente responde 404 NOT_FOUND con el formato común', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/no-existe' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'NOT_FOUND',
      message: 'La ruta GET /v1/no-existe no existe',
    });
  });

  it('un error inesperado responde 500 sin exponer detalles internos', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    });
    expect(response.body).not.toContain('secreto');
  });
});
