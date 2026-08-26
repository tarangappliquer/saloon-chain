-- PostgreSQL Composite Types Initialization (Explicit public. schema)
-- Already Postgres 18+ compatible -- copied through unchanged from db/02_types.sql.
-- dbo.IntIdList (the T-SQL integer-list TVP) has no counterpart type here: 03_procs_postgres.sql
-- passes those as a plain `integer[]` parameter instead (unnest() where the original joined the TVP).
SET search_path TO public;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'purchaseorderlinetype' AND n.nspname = 'public') THEN
        CREATE TYPE public.PurchaseOrderLineType AS (
            ProductId INT,
            Quantity INT,
            UnitCost NUMERIC(10,2)
        );
    END IF;
END $$;
