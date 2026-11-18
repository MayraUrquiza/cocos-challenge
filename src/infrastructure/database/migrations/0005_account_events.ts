import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Historial contable inmutable (ADR-0003, punto 2). Un stream por cuenta,
 * ordenado por `sequence`.
 */
export const accountEvents: Migration = {
  async up(db: Kysely<unknown>) {
    await sql`
      CREATE TABLE account_events (
        id BIGSERIAL PRIMARY KEY,
        -- Para que quien reciba los eventos pueda descartar duplicados.
        event_id UUID NOT NULL DEFAULT gen_random_uuid(),
        account_id INT NOT NULL REFERENCES users (id),
        sequence INT NOT NULL CHECK (sequence > 0),
        event_type VARCHAR(40) NOT NULL,
        event_version SMALLINT NOT NULL CHECK (event_version > 0),
        order_id INT NOT NULL REFERENCES orders (id),
        payload JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        occurred_at TIMESTAMPTZ NOT NULL,

        CONSTRAINT account_events_event_id_key UNIQUE (event_id),
        -- Ordena el stream y frena escrituras que se salteen el bloqueo de la cuenta.
        CONSTRAINT account_events_account_id_sequence_key UNIQUE (account_id, sequence),
        CONSTRAINT account_events_event_type_check CHECK (
          event_type IN (
            'OrderAccepted', 'OrderFilled', 'OrderRejected', 'OrderCancelled',
            'CashTransferredIn', 'CashTransferredOut', 'LegacyOrderImported'
          )
        )
      )
    `.execute(db);

    await sql`CREATE INDEX account_events_order_id_idx ON account_events (order_id)`.execute(db);

    // La base impide modificar o borrar eventos, incluso al dueño de la tabla.
    await sql`
      CREATE FUNCTION account_events_reject_changes() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'account_events es inmutable: % no está permitido', TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$
    `.execute(db);
    await sql`
      CREATE TRIGGER account_events_no_update_or_delete
        BEFORE UPDATE OR DELETE ON account_events
        FOR EACH ROW EXECUTE FUNCTION account_events_reject_changes()
    `.execute(db);
    await sql`
      CREATE TRIGGER account_events_no_truncate
        BEFORE TRUNCATE ON account_events
        FOR EACH STATEMENT EXECUTE FUNCTION account_events_reject_changes()
    `.execute(db);

    // La aplicación solo agrega y lee eventos (ADR-0003, punto 2). Nunca UPDATE ni DELETE.
    await sql`GRANT SELECT, INSERT ON account_events TO cocos_app`.execute(db);
    await sql`GRANT USAGE ON SEQUENCE account_events_id_seq TO cocos_app`.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`DROP TABLE account_events`.execute(db);
    await sql`DROP FUNCTION account_events_reject_changes()`.execute(db);
  },
};
