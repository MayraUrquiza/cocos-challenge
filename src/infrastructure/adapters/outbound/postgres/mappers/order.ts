import type { OrderView } from '../../../../../application/shared/order-view';
import type { OrderSnapshot } from '../../../../../domain/order/order';
import type { InstrumentType } from '../../../../../domain/shared/instrument';
import { Money } from '../../../../../domain/shared/money';
import {
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  REJECT_REASONS,
} from '../../../../../domain/shared/order-values';
import { Quantity, quantityScale } from '../../../../../domain/shared/quantity';

/** Fila de `orders` con el tipo de su instrumento, que define la escala de `size`. */
export interface OrderRow {
  id: number;
  userid: number | null;
  instrumentid: number | null;
  side: string;
  type: string;
  size: string | null;
  price: string | null;
  status: string;
  rejectreason: string | null;
  datetime: Date | null;
  instrument_type: string | null;
}

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | null,
  field: string,
  orderId: number,
): T {
  if (value === null || !allowed.includes(value as T)) {
    throw new Error(`La orden ${orderId} tiene un ${field} inválido: ${value}`);
  }
  return value as T;
}

function required<T>(value: T | null, field: string, orderId: number): T {
  if (value === null) throw new Error(`La orden ${orderId} no tiene ${field}`);
  return value;
}

/**
 * Fila → read model. Renombra las columnas, convierte `NUMERIC` a `Quantity`
 * y `Money`, y falla ante un dato roto en lugar de inventar un valor.
 */
export function toOrderView(row: OrderRow): OrderView {
  const instrumentType = oneOf<InstrumentType>(
    ['ACCIONES', 'MONEDA'],
    row.instrument_type,
    'tipo de instrumento',
    row.id,
  );

  return {
    id: row.id,
    userId: required(row.userid, 'usuario', row.id),
    instrumentId: required(row.instrumentid, 'instrumento', row.id),
    side: oneOf(ORDER_SIDES, row.side, 'side', row.id),
    type: oneOf(ORDER_TYPES, row.type, 'type', row.id),
    size: row.size === null ? null : Quantity.of(row.size, quantityScale(instrumentType)),
    price: row.price === null ? null : Money.of(row.price),
    status: oneOf(ORDER_STATUSES, row.status, 'status', row.id),
    rejectReason:
      row.rejectreason === null
        ? null
        : oneOf(REJECT_REASONS, row.rejectreason, 'motivo de rechazo', row.id),
    datetime: required(row.datetime, 'fecha', row.id),
  };
}

/** Fila → la orden en su estado final, con las mismas validaciones que el read model. */
export function toOrderSnapshot(row: OrderRow): OrderSnapshot {
  const { id, instrumentId, side, type, size, price, status } = toOrderView(row);
  return { orderId: id, instrumentId, side, type, size, price, status };
}
