import { sql, type Kysely } from 'kysely';

/**
 * Carga en el historial las órdenes que todavía no tienen ningún evento
 * (ADR-0003, punto 4). Hoy son las 11 órdenes semilla.
 *
 * - Un único `LegacyOrderImported` por orden, con su estado final, no se
 *   inventan pasos intermedios.
 * - Por cuenta, en orden de `(datetime, id)`, continuando la secuencia que la
 *   cuenta ya tenga.
 * - Idempotente: una orden con algún evento no se vuelve a cargar.
 *
 * Devuelve cuántos eventos insertó.
 */
export async function backfillLegacyOrders<DB>(db: Kysely<DB>): Promise<number> {
  const result = await sql`
    INSERT INTO account_events (
      account_id, sequence, event_type, event_version, order_id, payload, metadata, occurred_at
    )
    SELECT
      o.userid,
      COALESCE(
        (SELECT max(e.sequence) FROM account_events e WHERE e.account_id = o.userid),
        0
      ) + row_number() OVER (PARTITION BY o.userid ORDER BY o.datetime, o.id),
      'LegacyOrderImported',
      1,
      o.id,
      -- La fila completa, con los montos como texto para no perder precisión.
      jsonb_build_object(
        'orderId', o.id,
        'userId', o.userid,
        'instrumentId', o.instrumentid,
        'side', o.side,
        'type', o.type,
        'size', o.size::text,
        'price', o.price::text,
        'status', o.status,
        'rejectReason', o.rejectreason,
        'datetime', o.datetime
      ),
      '{"source": "backfill"}',
      o.datetime
    FROM orders o
    WHERE NOT EXISTS (SELECT 1 FROM account_events e WHERE e.order_id = o.id)
    ORDER BY o.userid, o.datetime, o.id
  `.execute(db);

  return Number(result.numAffectedRows ?? 0);
}
