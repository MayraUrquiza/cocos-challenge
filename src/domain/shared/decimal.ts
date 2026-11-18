import DecimalJs from 'decimal.js';

/**
 * Aritmética decimal exacta para todo cálculo con dinero (RFC-001, Principios
 * del diseño). Es una instancia propia para no depender de la configuración
 * global de decimal.js. Redondea "half up": 0,445 → 0,45 y −0,445 → −0,45.
 */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** Un string decimal válido: `"925.85"`, `"-10"`, `"0.5"`. Sin notación científica. */
const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

export function parseDecimal(value: string | number): Decimal {
  const text = typeof value === 'number' ? String(value) : value;
  if (!DECIMAL_STRING.test(text)) {
    throw new RangeError(`"${text}" no es un número decimal válido`);
  }
  return new Decimal(text);
}
