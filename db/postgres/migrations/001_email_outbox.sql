-- 001_email_outbox.sql
-- Durable email outbox: replaces the in-memory BackgroundEmailQueue (Channel) so a process
-- restart or SMTP outage never drops booking/auth/manager-alert mail. Developer error alerts
-- (DeveloperErrorNotifier) still send inline and do NOT use this table.
--
-- Safe to run once against a DB already built from 01_table_postgres.sql / 03_procs_postgres.sql.
SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.EmailOutbox (
    Id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Payload       JSONB NOT NULL,
    Subject       VARCHAR(500) NOT NULL DEFAULT '',
    Status        VARCHAR(10) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Sent','Failed')),
    Attempts      INT NOT NULL DEFAULT 0,
    NextAttemptAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    LastError     TEXT NULL,
    CreatedDate   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    SentDate      TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS IX_EmailOutbox_DuePending
    ON public.EmailOutbox(NextAttemptAt) WHERE Status = 'Pending';

CREATE OR REPLACE FUNCTION public.sp_EmailOutbox_Enqueue(p_Payload jsonb, p_Subject varchar) RETURNS bigint
LANGUAGE sql AS $$
    INSERT INTO public.EmailOutbox (Payload, Subject)
    VALUES (p_Payload, LEFT(COALESCE(p_Subject, ''), 500))
    RETURNING Id;
$$;

CREATE OR REPLACE FUNCTION public.fn_EmailOutbox_Claim(p_BatchSize int, p_VisibilitySeconds int)
RETURNS TABLE (Id bigint, Payload jsonb)
LANGUAGE sql AS $$
    UPDATE public.EmailOutbox o
    SET Attempts = o.Attempts + 1,
        NextAttemptAt = now() + make_interval(secs => p_VisibilitySeconds)
    FROM (
        SELECT e.Id
        FROM public.EmailOutbox e
        WHERE e.Status = 'Pending' AND e.NextAttemptAt <= now()
        ORDER BY e.CreatedDate
        LIMIT p_BatchSize
        FOR UPDATE SKIP LOCKED
    ) c
    WHERE o.Id = c.Id
    RETURNING o.Id, o.Payload;
$$;

CREATE OR REPLACE FUNCTION public.sp_EmailOutbox_MarkSent(p_Id bigint) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.EmailOutbox
    SET Status = 'Sent', SentDate = now(), LastError = NULL
    WHERE Id = p_Id;
$$;

CREATE OR REPLACE FUNCTION public.sp_EmailOutbox_MarkFailed(
    p_Id bigint, p_Error text, p_MaxAttempts int, p_BackoffBaseSeconds int) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.EmailOutbox
    SET Status = CASE WHEN Attempts >= p_MaxAttempts THEN 'Failed' ELSE 'Pending' END,
        NextAttemptAt = now() + make_interval(secs => p_BackoffBaseSeconds * GREATEST(Attempts, 1)),
        LastError = LEFT(COALESCE(p_Error, ''), 4000)
    WHERE Id = p_Id;
$$;
