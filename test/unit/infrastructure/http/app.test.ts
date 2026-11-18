import { Type } from 'typebox';
import { buildApp, type App } from '../../../../src/infrastructure/adapters/inbound/http/app';
import { stubUseCases } from '../../../support/use-cases';

const healthyDatabase = async (): Promise<void> => {};
const downDatabase = async (): Promise<void> => {
  throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
};

describe('aplicación HTTP', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('responde 200 si la base responde', async () => {
      app = await buildApp({ checkDatabase: healthyDatabase, useCases: stubUseCases() });

      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });

    it('responde 503 si la base no responde, sin exponer el error', async () => {
      app = await buildApp({ checkDatabase: downDatabase, useCases: stubUseCases() });

      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable' });
    });
  });

  describe('formato de errores', () => {
    beforeEach(async () => {
      app = await buildApp({ checkDatabase: healthyDatabase, useCases: stubUseCases() });
      app.post(
        '/test/validation',
        {
          schema: {
            body: Type.Object(
              { size: Type.Integer({ exclusiveMinimum: 0 }) },
              { additionalProperties: false },
            ),
          },
        },
        async () => ({ ok: true }),
      );
      app.get('/test/boom', async () => {
        throw new Error('detalle interno secreto');
      });
    });

    it('una ruta inexistente responde 404 NOT_FOUND', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/no-existe' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        code: 'NOT_FOUND',
        message: 'La ruta GET /v1/no-existe no existe',
      });
    });

    it('un campo no declarado responde 400 VALIDATION_ERROR en lugar de descartarse', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test/validation',
        payload: { size: 10, price: 900 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_ERROR',
        message: 'El request no es válido',
        details: [{ field: 'price', message: 'price no es un campo permitido' }],
      });
    });

    it('un valor fuera de rango responde 400 con el detalle del campo', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test/validation',
        payload: { size: 0 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().details).toEqual([
        { field: 'size', message: 'size debe ser mayor que 0' },
      ]);
    });

    it('un JSON mal formado responde 400 con el formato común', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test/validation',
        headers: { 'content-type': 'application/json' },
        payload: '{"size":',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
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

  describe('correlationId', () => {
    beforeEach(async () => {
      app = await buildApp({ checkDatabase: healthyDatabase, useCases: stubUseCases() });
    });

    it('devuelve el x-correlation-id recibido', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-correlation-id': 'abc-123' },
      });

      expect(response.headers['x-correlation-id']).toBe('abc-123');
    });

    it('genera uno nuevo si no llega o no es válido', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-correlation-id': 'no válido\n' },
      });

      expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('publica el OpenAPI con la ruta /health', async () => {
    app = await buildApp({ checkDatabase: healthyDatabase, useCases: stubUseCases() });

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    expect(response.json().paths).toHaveProperty('/health');
  });
});
