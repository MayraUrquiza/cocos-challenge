import type { FastifySchemaValidationError } from 'fastify/types/schema';
import { formatValidationErrors } from '../../../../src/infrastructure/adapters/inbound/http/errors/validation-error-formatter';

function ajvError(
  keyword: string,
  instancePath: string,
  params: Record<string, unknown>,
  message?: string,
): FastifySchemaValidationError {
  return { keyword, instancePath, schemaPath: '', params, ...(message ? { message } : {}) };
}

describe('formatValidationErrors', () => {
  it('nombra el campo faltante', () => {
    const details = formatValidationErrors(
      [ajvError('required', '', { missingProperty: 'price' })],
      'body',
    );
    expect(details).toEqual([{ field: 'price', message: 'price es obligatorio' }]);
  });

  it('nombra el campo no declarado', () => {
    const details = formatValidationErrors(
      [ajvError('additionalProperties', '', { additionalProperty: 'foo' })],
      'body',
    );
    expect(details).toEqual([{ field: 'foo', message: 'foo no es un campo permitido' }]);
  });

  it('arma la ruta de campos anidados', () => {
    const details = formatValidationErrors(
      [ajvError('type', '/items/0/size', { type: 'integer' })],
      'body',
    );
    expect(details).toEqual([
      { field: 'items.0.size', message: 'items.0.size debe ser de tipo entero' },
    ]);
  });

  it('traduce los límites', () => {
    const details = formatValidationErrors(
      [
        ajvError('exclusiveMinimum', '/size', { limit: 0 }),
        ajvError('maximum', '/limit', { limit: 100 }),
        ajvError('minLength', '/q', { limit: 1 }),
      ],
      'querystring',
    );
    expect(details.map((detail) => detail.message)).toEqual([
      'size debe ser mayor que 0',
      'limit debe ser menor o igual que 100',
      'q debe tener al menos 1 caracteres',
    ]);
  });

  it('usa el contexto cuando el error es sobre el request entero', () => {
    const details = formatValidationErrors([ajvError('type', '', { type: 'object' })], 'body');
    expect(details).toEqual([{ field: 'body', message: 'body debe ser de tipo objeto' }]);
  });

  it('usa el mensaje de Ajv para palabras clave sin traducción', () => {
    const details = formatValidationErrors(
      [ajvError('multipleOf', '/price', { multipleOf: 0.01 }, 'must be multiple of 0.01')],
      'body',
    );
    expect(details).toEqual([{ field: 'price', message: 'price must be multiple of 0.01' }]);
  });

  it('elimina detalles repetidos', () => {
    const error = ajvError('required', '', { missingProperty: 'side' });
    expect(formatValidationErrors([error, error], 'body')).toHaveLength(1);
  });
});
