import type { Kysely } from 'kysely';
import { eventFromSnapshot, type AccountEvent } from '../../../../domain/account/events';
import type { DB } from '../../../database/schema';
import { toOrderSnapshot, type OrderRow } from './mappers/order';

export function selectOrderRows(db: Kysely<DB>, userId: number) {
  return db
    .selectFrom('orders as o')
    .innerJoin('instruments as i', 'i.id', 'o.instrumentid')
    .select([
      'o.id',
      'o.userid',
      'o.instrumentid',
      'o.side',
      'o.type',
      'o.size',
      'o.price',
      'o.status',
      'o.rejectreason',
      'o.datetime',
      'i.type as instrument_type',
      'i.ticker as instrument_ticker',
      'i.name as instrument_name',
    ])
    .where('o.userid', '=', userId);
}

/**
 * Las órdenes de una cuenta que afectan sus saldos (ejecutadas y pendientes),
 * en el orden en que ocurrieron: por fecha y, si coinciden, por número
 * (RFC-001). Usa el índice (userId, status, instrumentId).
 *
 * La comparten el portfolio y el repositorio de la cuenta: el disponible que se
 * muestra y el que se valida salen de la misma lectura.
 */
export function selectAccountOrders(db: Kysely<DB>, userId: number) {
  return selectOrderRows(db, userId)
    .where('o.status', 'in', ['FILLED', 'NEW'])
    .orderBy('o.datetime')
    .orderBy('o.id');
}

/**
 * Mientras `orders` sea la fuente de verdad, los eventos salen del estado final
 * de cada orden: el saldo solo depende de dónde terminó cada una. Con event
 * sourcing, esta traducción se reemplaza por la lectura de `account_events`.
 */
export function toAccountEvents(rows: readonly OrderRow[]): AccountEvent[] {
  return rows
    .map((row) => eventFromSnapshot(toOrderSnapshot(row)))
    .filter((event) => event !== null);
}
