import type { Plugin } from 'ajv';

/**
 * Plugin de Ajv con la palabra clave `exactlyOneOf`: el objeto tiene que traer
 * exactamente una de las propiedades listadas. Expresa reglas como "size o
 * amount, no ambos" con un mensaje claro, en lugar de los errores de `oneOf`,
 * que reportan todas las ramas (ADR-0001, punto 2).
 */
export const exactlyOneOfKeyword: Plugin<unknown> = (ajv) => {
  function validate(properties: string[], data: Record<string, unknown>): boolean {
    const present = properties.filter((property) => data[property] !== undefined);
    if (present.length === 1) return true;
    validate.errors = [
      {
        keyword: 'exactlyOneOf',
        message: `must have exactly one of ${properties.join(', ')}`,
        params: { properties, present },
      },
    ];
    return false;
  }
  validate.errors = [] as Array<{
    keyword: string;
    message: string;
    params: { properties: string[]; present: string[] };
  }>;

  return ajv.addKeyword({
    keyword: 'exactlyOneOf',
    type: 'object',
    schemaType: 'array',
    errors: true,
    validate,
  });
};
