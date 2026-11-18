import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Controles, columnas nuevas e índices de `orders` (ADR-0003, punto 6).
 * Las columnas nuevas van sin comillas, así que PostgreSQL las guarda en
 * minúsculas, igual que el resto del esquema.
 */
export const ordersConstraints: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`
      ALTER TABLE orders
        -- Transferencias con centavos (ADR-0003, punto 5).
        ALTER COLUMN size TYPE NUMERIC(18, 2),
        -- Un instante absoluto, no una hora local (ADR-0003, punto 6). Los valores
        -- existentes están en UTC, así que representan el mismo instante.
        ALTER COLUMN datetime TYPE TIMESTAMPTZ USING datetime AT TIME ZONE 'UTC',
        ALTER COLUMN side SET NOT NULL,
        ALTER COLUMN type SET NOT NULL,
        ALTER COLUMN status SET NOT NULL,
        ADD COLUMN rejectReason VARCHAR(30) NULL,
        ADD COLUMN idempotencyKey VARCHAR(64) NULL,
        ADD COLUMN requestHash CHAR(64) NULL,

        ADD CONSTRAINT orders_side_check
          CHECK (side IN ('BUY', 'SELL', 'CASH_IN', 'CASH_OUT')),
        ADD CONSTRAINT orders_type_check
          CHECK (type IN ('MARKET', 'LIMIT')),
        ADD CONSTRAINT orders_status_check
          CHECK (status IN ('NEW', 'FILLED', 'REJECTED', 'CANCELLED')),

        -- Las acciones no se fraccionan. Es una red de seguridad: la escala la decide el dominio.
        ADD CONSTRAINT orders_size_whole_units_check
          CHECK (side IN ('CASH_IN', 'CASH_OUT') OR size = trunc(size)),

        -- Una orden rechazada puede no tener precio o tener cantidad 0 (ADR-0004, punto 4).
        -- El resto necesita cantidad y precio mayores que 0.
        ADD CONSTRAINT orders_size_price_check
          CHECK (
            (size IS NULL OR size >= 0)
            AND (price IS NULL OR price > 0)
            AND (
              status = 'REJECTED'
              OR (size IS NOT NULL AND size > 0 AND price IS NOT NULL)
            )
          ),

        -- Solo una orden rechazada tiene motivo, y el motivo es uno de los conocidos.
        -- La orden semilla rechazada queda con NULL.
        ADD CONSTRAINT orders_reject_reason_check
          CHECK (
            rejectReason IS NULL
            OR (
              status = 'REJECTED'
              AND rejectReason IN (
                'NO_MARKET_PRICE', 'ZERO_QUANTITY', 'INSUFFICIENT_FUNDS', 'INSUFFICIENT_HOLDINGS'
              )
            )
          ),

        -- La clave y el hash del body se guardan juntos (ADR-0005, punto 7).
        ADD CONSTRAINT orders_idempotency_check
          CHECK ((idempotencyKey IS NULL) = (requestHash IS NULL))
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX orders_userid_idempotencykey_key ON orders (userId, idempotencyKey)
    `.execute(db);
    await sql`
      CREATE INDEX orders_userid_status_instrumentid_idx ON orders (userId, status, instrumentId)
    `.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`DROP INDEX orders_userid_status_instrumentid_idx`.execute(db);
    await sql`DROP INDEX orders_userid_idempotencykey_key`.execute(db);
    // Falla si quedaron transferencias con centavos: volver a INT perdería datos.
    await sql`
      ALTER TABLE orders
        DROP CONSTRAINT orders_idempotency_check,
        DROP CONSTRAINT orders_reject_reason_check,
        DROP CONSTRAINT orders_size_price_check,
        DROP CONSTRAINT orders_size_whole_units_check,
        DROP CONSTRAINT orders_status_check,
        DROP CONSTRAINT orders_type_check,
        DROP CONSTRAINT orders_side_check,
        DROP COLUMN requestHash,
        DROP COLUMN idempotencyKey,
        DROP COLUMN rejectReason,
        ALTER COLUMN status DROP NOT NULL,
        ALTER COLUMN type DROP NOT NULL,
        ALTER COLUMN side DROP NOT NULL,
        ALTER COLUMN datetime TYPE TIMESTAMP USING datetime AT TIME ZONE 'UTC',
        ALTER COLUMN size TYPE INT
    `.execute(db);
  },
};
