import type { Plugin } from 'ajv';

/**
 * Cuántos decimales tiene un número JSON tal como llegó. Se cuenta sobre su
 * representación en texto: con `multipleOf: 0.01`, 0.29 fallaría por los
 * errores de redondeo de los doubles (ADR-0001, punto 2).
 */
export function decimalPlaces(value: number): number {
  const text = String(value);
  // Notación científica con exponente negativo (1e-7): más decimales de los que se admiten.
  if (text.includes('e-')) return Number.POSITIVE_INFINITY;
  return text.split('.')[1]?.length ?? 0;
}

/** Plugin de Ajv con la palabra clave `maxDecimals`: `Type.Number({ maxDecimals: 2 })`. */
export const maxDecimalsKeyword: Plugin<unknown> = (ajv) => {
  // Ajv lee los errores de la propiedad `errors` de la función.
  function validate(limit: number, value: number): boolean {
    if (decimalPlaces(value) <= limit) return true;
    validate.errors = [
      { keyword: 'maxDecimals', message: `must have at most ${limit} decimals`, params: { limit } },
    ];
    return false;
  }
  validate.errors = [] as Array<{ keyword: string; message: string; params: { limit: number } }>;

  return ajv.addKeyword({
    keyword: 'maxDecimals',
    type: 'number',
    schemaType: 'number',
    errors: true,
    validate,
  });
};
