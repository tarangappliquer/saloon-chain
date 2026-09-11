-- PostgreSQL 18+ port of db/03_procs.sql (SQL Server T-SQL stored procedures).
-- Run after db/01_table_postgres.sql and db/02_types_postgres.sql.
SET search_path TO public;

-- Makes this script safely re-runnable over a database that already has an older version of
-- these routines. CREATE OR REPLACE FUNCTION/PROCEDURE cannot change an OUT-parameter row type or
-- a RETURNS TABLE column list in place (Postgres error 42P13, "cannot change return type of
-- existing function") -- only DROP can. This finds every sp_*/fn_* routine already in the public
-- schema, whatever its current signature, and drops it before the CREATE statements below run.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.proname, p.prokind, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (p.proname LIKE 'sp\_%' ESCAPE '\' OR p.proname LIKE 'fn\_%' ESCAPE '\')
    LOOP
        EXECUTE format('DROP %s public.%I(%s)',
            CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
            r.proname, r.args);
    END LOOP;
END $$;

-------------------------------------------------------------------------------------------------
-- Conventions used throughout this port (read once, applies to every routine below)
-------------------------------------------------------------------------------------------------
-- * Schema: public. (matches 01_table_postgres.sql / 02_types_postgres.sql). Table/column names
--   keep the source's PascalCase spelling unquoted -- Postgres folds unquoted identifiers to
--   lowercase the same way at both CREATE TABLE and reference time, so this reads identically to
--   the C#/Dapper call sites without renaming anything.
-- * Parameters are prefixed p_, local variables v_ -- sidesteps PL/pgSQL's "ambiguous column
--   reference" trap when a parameter shares a name with a table column (ubiquitous here: Id,
--   LocationId, CustomerId, ...).
-- * WITH (NOLOCK) is dropped everywhere. It existed in the T-SQL to stop plain SELECTs from
--   blocking behind writer locks under SQL Server's default (non-RCSI) locking. Postgres MVCC
--   readers never block behind writers at all under the default READ COMMITTED level, so the
--   hint has no Postgres equivalent and nothing is lost by omitting it.
-- * SCOPE_IDENTITY() -> `INSERT ... RETURNING Id INTO v_id` on the insert itself.
-- * @Param OUTPUT -> an `OUT`/`INOUT` parameter on the function; a T-SQL proc whose only output was
--   one `SELECT` result set becomes `RETURNS TABLE(...)`; a proc that returns MULTIPLE T-SQL result
--   sets becomes one `RETURNS TABLE(...)` FUNCTION per result set instead of a single multi-cursor
--   PROCEDURE -- the C# side reads them together in one round trip via Dapper's own
--   `QueryMultipleAsync("SELECT * FROM fn_a(...); SELECT * FROM fn_b(...);", args)`, no hand-rolled
--   refcursor/transaction plumbing needed (see `fn_Booking_Availability*` below, or
--   `BookingDbService.cs` for the C# side). An EARLIER version of this file used a `PROCEDURE` with
--   one named `refcursor` INOUT parameter per result set instead -- if you find a stray `refcursor`
--   param anywhere below, it was missed in that conversion and should be split the same way.
-- * `THROW 5000N, 'message', 1` -> `RAISE EXCEPTION 'message' USING ERRCODE = '5000N'`. Postgres
--   SQLSTATEs are free-form 5-char codes outside the standard-defined classes, so the original
--   error number is preserved verbatim as the SQLSTATE -- the C# AppExceptionHandler's existing
--   50000-50999 -> 409 dispatch keeps working unchanged against Npgsql's exception.SqlState.
-- * A T-SQL proc's own `BEGIN TRAN ... IF <failure> ROLLBACK; THROW; ... COMMIT` wrapper is
--   dropped everywhere: a Postgres routine already executes as part of its caller's transaction,
--   and RAISE EXCEPTION already unwinds (rolls back) every write the routine made, same net effect
--   as the explicit ROLLBACK+THROW, without writing it out by hand.
-- * `sp_getapplock @LockTimeout = 5000` -> `SET LOCAL lock_timeout` + `pg_advisory_xact_lock`
--   (auto-released at the end of the enclosing transaction, same lifetime as the T-SQL
--   'Transaction'-owned applock). A lock_timeout expiry (SQLSTATE 55P03) is caught and re-raised
--   as the original 50001 "Could not acquire booking lock" error.
-- * `dbo.IntIdList` (T-SQL integer-list TVP) -> a plain `integer[]` parameter, joined via
--   `unnest(p_ids)`. `dbo.PurchaseOrderLineList` -> `public.PurchaseOrderLineType[]` (the composite
--   type already defined in 02_types_postgres.sql), joined via `unnest(p_lines)`.
-- * SQL Server table variables (`DECLARE @X TABLE (...)`, `OUTPUT ... INTO @X`) -> either a CTE
--   built straight from an `UPDATE/INSERT ... RETURNING` (idiomatic Postgres, used wherever the
--   original only needed the OUTPUT rows once), or a `CREATE TEMP TABLE ... ON COMMIT DROP` where
--   the original genuinely re-reads it across multiple statements (sp_Admin_GetDashboardStats).
-- * A recursive "generate the dates between @From and @To" CTE -> `generate_series(a, b,
--   interval '1 day')::date`, no recursion needed.
-- * `BookingTreatments.StartTime/EndTime/ExpiresAt` are TIMESTAMPTZ (01_table_postgres.sql) but
--   the original T-SQL logic treats StartTime/EndTime as *naive local wall-clock* values (it
--   compares their TIME portion directly against a Location's plain-TIME OpenTime/CloseTime, with
--   no timezone conversion anywhere) -- only ExpiresAt is a genuine UTC instant (compared against
--   SYSUTCDATETIME()). To reproduce that exactly: SYSUTCDATETIME() -> `now()` (already an absolute
--   instant, correct for ExpiresAt-style comparisons); any `CAST(col AS DATE)` / `CAST(col AS
--   TIME)` extraction from StartTime/EndTime -> `(col AT TIME ZONE 'utc')::date` / `::time`, which
--   recovers the original naive wall-clock numbers regardless of the connecting session's
--   `TimeZone` GUC. `CAST(GETUTCDATE() AS DATE)` -> `(now() AT TIME ZONE 'utc')::date`.
-- * SQL Server's DATEFIRST/locale-independent day-of-week bit (`POWER(2, DATEDIFF(DAY, 0,
--   @Date) % 7)`, day 0 = 1900-01-01, a Monday) is reused all over this file (WorkingDaysMask /
--   LocationDaySchedule.DayBit). Rather than repeat that expression at every call site, it's
--   factored into fn_DayBit() below -- same bit scheme, same epoch, same result.
-- * `Name LIKE '%term%'` -> `Name ILIKE '%term%'`. SQL Server's default collation is
--   case-insensitive; Postgres LIKE is case-sensitive by default, so the free-text search procs
--   (sp_Catalog_Search, sp_Admin_SearchCustomers, sp_Admin_GetCustomers) switch to ILIKE to keep
--   the same case-insensitive behavior instead of silently narrowing every search.
-- * `MERGE` upserts -> `INSERT ... ON CONFLICT (...) DO UPDATE`, keyed off the same unique index
--   the MERGE's ON clause was really relying on (UQ_ShiftAssignments_..., UQ_RoomCategoryAssignments_...,
--   UX_CommissionRules_..., StaffProfiles' own primary key).
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_DayBit(p_Date date) RETURNS smallint
LANGUAGE sql IMMUTABLE AS $$
    SELECT (1 << ((p_Date - DATE '1900-01-01') % 7))::smallint;
$$;

CREATE OR REPLACE FUNCTION public.fn_UtcToday() RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE 'utc')::date;
$$;

-- Shared by sp_Booking_ScheduleTreatment / sp_Booking_RescheduleConfirmed / sp_Booking_ReassignTherapist:
-- acquires a named advisory lock, bounded by lock_timeout, raising the same 50001 error the T-SQL
-- sp_getapplock timeout produced. Caller sets `SET LOCAL lock_timeout` before invoking this, or
-- passes p_TimeoutMs itself; done as a function (not inlined) purely to avoid repeating the
-- EXCEPTION handler at all three call sites.
CREATE OR REPLACE FUNCTION public.fn_AcquireBookingLock(p_LockKey text, p_TimeoutMs int DEFAULT 5000) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('SET LOCAL lock_timeout = %L', p_TimeoutMs::text || 'ms');
    BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_LockKey, 0));
    EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'Could not acquire booking lock, try again.' USING ERRCODE = '50001';
    END;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Catalog: public reads
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetChains()
RETURNS TABLE(Id int, Name varchar, BreakStartTime time, BreakEndTime time)
LANGUAGE sql STABLE AS $$
    SELECT Id, Name, BreakStartTime, BreakEndTime
    FROM public.SaloonChains
    WHERE IsDelete = FALSE AND IsActive = TRUE
    ORDER BY Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetLocations(p_ChainId int DEFAULT NULL)
RETURNS TABLE(Id int, ChainId int, Name varchar, Address varchar, Latitude numeric, Longitude numeric,
              OpenTime time, CloseTime time, BreakStartTime time, BreakEndTime time,
              WorkingDaysMask smallint, TimeZoneId varchar)
LANGUAGE sql STABLE AS $$
    SELECT l.Id, l.ChainId, l.Name, l.Address, l.Latitude, l.Longitude,
           l.OpenTime, l.CloseTime,
           COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask, l.TimeZoneId
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
    WHERE (p_ChainId IS NULL OR l.ChainId = p_ChainId) AND l.IsDelete = FALSE AND l.IsActive = TRUE
    ORDER BY l.Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetLocationHolidays(p_LocationId int, p_FromDate date, p_ToDate date)
RETURNS TABLE(HolidayDate date, Reason varchar)
LANGUAGE sql STABLE AS $$
    SELECT h.HolidayDate, h.Reason
    FROM public.LocationHolidays h
    WHERE h.LocationId = p_LocationId AND h.HolidayDate BETWEEN p_FromDate AND p_ToDate
        AND h.IsDelete = FALSE AND h.IsActive = TRUE
    ORDER BY h.HolidayDate;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetTreatments(p_LocationId int, p_CategoryId int DEFAULT NULL)
RETURNS TABLE(Id int, CategoryId int, CategoryName varchar, Name varchar, Description varchar,
              Price numeric, DurationSlots smallint, PreTimeMinutes smallint)
LANGUAGE sql STABLE AS $$
    SELECT t.Id, t.CategoryId, tc.Name AS CategoryName, t.Name, t.Description, cp.Price, cd.DurationSlots, cd.PreTimeMinutes
    FROM public.Treatments t
        JOIN public.TreatmentCategories tc ON tc.Id = t.CategoryId
        JOIN LATERAL (
            SELECT tp.Price
            FROM public.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= public.fn_UtcToday() AND (tp.EffectiveTo IS NULL OR tp.EffectiveTo >= public.fn_UtcToday()) AND tp.IsDelete = FALSE
            ORDER BY CASE WHEN tp.EffectiveTo = tp.EffectiveFrom THEN 1 WHEN tp.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, tp.EffectiveFrom DESC
            LIMIT 1
        ) cp ON TRUE
        JOIN LATERAL (
            SELECT td.DurationSlots, td.PreTimeMinutes
            FROM public.TreatmentDurations td
            WHERE td.TreatmentId = t.Id AND td.EffectiveFrom <= public.fn_UtcToday() AND (td.EffectiveTo IS NULL OR td.EffectiveTo >= public.fn_UtcToday()) AND td.IsDelete = FALSE
            ORDER BY CASE WHEN td.EffectiveTo = td.EffectiveFrom THEN 1 WHEN td.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, td.EffectiveFrom DESC
            LIMIT 1
        ) cd ON TRUE
    WHERE t.LocationId = p_LocationId AND t.IsDelete = FALSE AND t.IsActive = TRUE
        AND t.EffectiveFrom <= public.fn_UtcToday()
        AND tc.IsDelete = FALSE AND tc.IsActive = TRUE
        AND (p_CategoryId IS NULL OR t.CategoryId = p_CategoryId)
    ORDER BY tc.Name, t.Name;
$$;

-------------------------------------------------------------------------------------------------
-- Booking availability (single-purpose functions -- one per result set, called together via
-- Dapper QueryMultipleAsync instead of a hand-rolled refcursor procedure; see BookingDbService.cs)
-------------------------------------------------------------------------------------------------

-- 1) location hours (+ explicit holiday flag). OpenTime/CloseTime resolve to this WorkDate's
-- scheduled override (LocationDaySchedule) if one is effective, else the location's own default
-- hours. An override marked IsClosed rolls into IsHoliday, same "no slots" outcome as an explicit
-- holiday.
DROP FUNCTION IF EXISTS public.fn_Booking_AvailabilityLocationHours(int, date);
CREATE FUNCTION public.fn_Booking_AvailabilityLocationHours(p_LocationId int, p_WorkDate date)
RETURNS TABLE(OpenTime time, CloseTime time, BreakStartTime time, BreakEndTime time, WorkingDaysMask smallint, IsHoliday boolean, TimeZoneId varchar)
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(dh.OpenTime, l.OpenTime) AS OpenTime, COALESCE(dh.CloseTime, l.CloseTime) AS CloseTime,
           COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask,
           (COALESCE(dh.IsClosed, FALSE) OR EXISTS (
               SELECT 1 FROM public.LocationHolidays h
               WHERE h.LocationId = l.Id AND h.HolidayDate = p_WorkDate AND h.IsDelete = FALSE AND h.IsActive = TRUE
           )) AS IsHoliday,
           l.TimeZoneId
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
        LEFT JOIN LATERAL (
            SELECT ds.OpenTime, ds.CloseTime, ds.IsClosed
            FROM public.LocationDaySchedule ds
            WHERE ds.LocationId = l.Id AND ds.DayBit = public.fn_DayBit(p_WorkDate) AND ds.EffectiveFrom <= p_WorkDate
                AND (ds.EffectiveTo IS NULL OR ds.EffectiveTo >= p_WorkDate) AND ds.IsDelete = FALSE
            ORDER BY CASE WHEN ds.EffectiveTo = ds.EffectiveFrom THEN 1 WHEN ds.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, ds.EffectiveFrom DESC
            LIMIT 1
        ) dh ON TRUE
    WHERE l.Id = p_LocationId AND l.IsDelete = FALSE AND l.IsActive = TRUE;
$$;

-- 1b) per-date resolved OpenTime/CloseTime for every date in a range. A date whose override is
-- IsClosed is dropped entirely -- GetAvailableDatesAsync treats a date missing here the same as a
-- holiday (no slots), so no separate closed-flag column is needed. (Single-date availability gets
-- its hours from fn_Booking_AvailabilityLocationHours above instead.)
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityRangeDayHours(p_LocationId int, p_FromDate date, p_ToDate date)
RETURNS TABLE(WorkDate date, OpenTime time, CloseTime time)
LANGUAGE sql STABLE AS $$
    SELECT ds.WorkDate,
           COALESCE(dh.OpenTime, l.OpenTime) AS OpenTime, COALESCE(dh.CloseTime, l.CloseTime) AS CloseTime
    FROM (SELECT generate_series(p_FromDate, p_ToDate, interval '1 day')::date AS WorkDate) ds
        CROSS JOIN public.Locations l
        LEFT JOIN LATERAL (
            SELECT lds.OpenTime, lds.CloseTime, lds.IsClosed
            FROM public.LocationDaySchedule lds
            WHERE lds.LocationId = l.Id
                AND lds.DayBit = public.fn_DayBit(ds.WorkDate)
                AND lds.EffectiveFrom <= ds.WorkDate
                AND (lds.EffectiveTo IS NULL OR lds.EffectiveTo >= ds.WorkDate) AND lds.IsDelete = FALSE
            ORDER BY CASE WHEN lds.EffectiveTo = lds.EffectiveFrom THEN 1 WHEN lds.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, lds.EffectiveFrom DESC
            LIMIT 1
        ) dh ON TRUE
    WHERE l.Id = p_LocationId AND l.IsDelete = FALSE AND l.IsActive = TRUE
        AND (dh.IsClosed IS NULL OR dh.IsClosed = FALSE);
$$;

-- Location's break times/working-days-mask -- date-independent (no per-date holiday flag either --
-- callers already resolve holiday dates for the whole range separately via LocationHolidays).
-- OpenTime/CloseTime are NOT included here -- they can vary per date, see the DayHours function above.
DROP FUNCTION IF EXISTS public.fn_Booking_AvailabilityRangeLocation(int);
CREATE FUNCTION public.fn_Booking_AvailabilityRangeLocation(p_LocationId int)
RETURNS TABLE(BreakStartTime time, BreakEndTime time, WorkingDaysMask smallint, TimeZoneId varchar)
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask,
           l.TimeZoneId
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
    WHERE l.Id = p_LocationId AND l.IsDelete = FALSE AND l.IsActive = TRUE;
$$;

-- 2) requested treatments (duration/category/price) as offered at this location -- shared by both
-- the single-date and range availability reads, since price/duration are always resolved as of
-- today regardless of which date(s) are being checked for open slots.
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityTreatments(p_LocationId int, p_TreatmentIds int[])
RETURNS TABLE(Id int, CategoryId int, DurationSlots smallint, Price numeric)
LANGUAGE sql STABLE AS $$
    SELECT t.Id, t.CategoryId, cd.DurationSlots, cp.Price
    FROM public.Treatments t
        JOIN unnest(p_TreatmentIds) AS ti(Id) ON ti.Id = t.Id
        JOIN LATERAL (
            SELECT tp.Price FROM public.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= public.fn_UtcToday() AND (tp.EffectiveTo IS NULL OR tp.EffectiveTo >= public.fn_UtcToday()) AND tp.IsDelete = FALSE
            ORDER BY CASE WHEN tp.EffectiveTo = tp.EffectiveFrom THEN 1 WHEN tp.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, tp.EffectiveFrom DESC
            LIMIT 1
        ) cp ON TRUE
        JOIN LATERAL (
            SELECT td.DurationSlots FROM public.TreatmentDurations td
            WHERE td.TreatmentId = t.Id AND td.EffectiveFrom <= public.fn_UtcToday() AND (td.EffectiveTo IS NULL OR td.EffectiveTo >= public.fn_UtcToday()) AND td.IsDelete = FALSE
            ORDER BY CASE WHEN td.EffectiveTo = td.EffectiveFrom THEN 1 WHEN td.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, td.EffectiveFrom DESC
            LIMIT 1
        ) cd ON TRUE
    WHERE t.LocationId = p_LocationId AND t.IsDelete = FALSE AND t.IsActive = TRUE
        AND t.EffectiveFrom <= public.fn_UtcToday();
$$;

-- 3) eligible room/therapist pairs for the date, for the category of the requested treatments
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityEligiblePairs(p_LocationId int, p_TreatmentIds int[], p_WorkDate date)
RETURNS TABLE(RoomId int, TherapistId int, ShiftType varchar, ShiftStart time, ShiftEnd time, WorkDate date)
LANGUAGE sql STABLE AS $$
    WITH loc AS (
        SELECT COALESCE(dh.OpenTime, l.OpenTime) AS OpenTime, COALESCE(dh.CloseTime, l.CloseTime) AS CloseTime
        FROM public.Locations l
            LEFT JOIN LATERAL (
                SELECT ds.OpenTime, ds.CloseTime
                FROM public.LocationDaySchedule ds
                WHERE ds.LocationId = l.Id AND ds.DayBit = public.fn_DayBit(p_WorkDate) AND ds.EffectiveFrom <= p_WorkDate
                    AND (ds.EffectiveTo IS NULL OR ds.EffectiveTo >= p_WorkDate) AND ds.IsDelete = FALSE
                ORDER BY CASE WHEN ds.EffectiveTo = ds.EffectiveFrom THEN 1 WHEN ds.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, ds.EffectiveFrom DESC
                LIMIT 1
            ) dh ON TRUE
        WHERE l.Id = p_LocationId AND l.IsDelete = FALSE AND l.IsActive = TRUE
    ),
    target_categories AS (
        SELECT DISTINCT t.CategoryId
        FROM public.Treatments t
            JOIN unnest(p_TreatmentIds) AS ti(Id) ON ti.Id = t.Id
        WHERE t.LocationId = p_LocationId AND t.IsDelete = FALSE AND t.IsActive = TRUE
    ),
    active_rooms AS (
        SELECT r.Id AS RoomId
        FROM public.Rooms r
        WHERE r.LocationId = p_LocationId AND r.IsDelete = FALSE AND r.IsActive = TRUE
    ),
    eligible_rooms AS (
        SELECT r.RoomId, rca.ShiftType
        FROM active_rooms r
            JOIN public.RoomCategoryAssignments rca ON rca.RoomId = r.RoomId AND rca.WorkDate = p_WorkDate AND rca.IsDelete = FALSE AND rca.IsActive = TRUE
        WHERE rca.TreatmentCategoryId IN (SELECT CategoryId FROM target_categories)

        UNION ALL

        SELECT r.RoomId, 'FullDay' AS ShiftType
        FROM active_rooms r
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.RoomCategoryAssignments rca2
                JOIN public.Rooms r2 ON r2.Id = rca2.RoomId
            WHERE r2.LocationId = p_LocationId AND rca2.IsDelete = FALSE AND rca2.IsActive = TRUE
        )
    ),
    eligible_shifts AS (
        SELECT sa.RoomId, sa.TherapistId, sa.ShiftType, sa.StartTime AS ShiftStart, sa.EndTime AS ShiftEnd
        FROM public.ShiftAssignments sa
        WHERE sa.LocationId = p_LocationId AND sa.WorkDate = p_WorkDate AND sa.IsDelete = FALSE AND sa.IsActive = TRUE

        UNION ALL

        SELECT NULL::int AS RoomId, tp.Id AS TherapistId, 'FullDay' AS ShiftType, loc.OpenTime AS ShiftStart, loc.CloseTime AS ShiftEnd
        FROM public.TherapistProfile tp
            CROSS JOIN loc
        WHERE tp.IsDelete = FALSE AND tp.IsActive = TRUE
            AND (tp.LocationId = p_LocationId OR tp.LocationId IS NULL)
            AND NOT EXISTS (
                SELECT 1 FROM public.ShiftAssignments sa2
                WHERE sa2.TherapistId = tp.Id AND sa2.IsDelete = FALSE AND sa2.IsActive = TRUE
            )
    )
    -- es.RoomId IS NULL covers legacy/no-shift-assignment rows (works any room); a shift
    -- explicitly assigned to a room only pairs with that same room.
    SELECT DISTINCT er.RoomId, es.TherapistId, es.ShiftType, es.ShiftStart, es.ShiftEnd, p_WorkDate AS WorkDate
    FROM eligible_rooms er
        JOIN eligible_shifts es
        ON (es.ShiftType = er.ShiftType OR er.ShiftType = 'FullDay' OR es.ShiftType = 'FullDay')
            AND (es.RoomId IS NULL OR es.RoomId = er.RoomId);
$$;

-- Range-aware sibling of fn_Booking_AvailabilityEligiblePairs above: same eligibility rules,
-- evaluated for every date in [p_FromDate, p_ToDate] via generate_series() instead of one p_WorkDate.
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityRangeEligiblePairs(p_LocationId int, p_TreatmentIds int[], p_FromDate date, p_ToDate date)
RETURNS TABLE(RoomId int, TherapistId int, ShiftType varchar, ShiftStart time, ShiftEnd time, WorkDate date)
LANGUAGE sql STABLE AS $$
    WITH dates AS (
        SELECT generate_series(p_FromDate, p_ToDate, interval '1 day')::date AS WorkDate
    ),
    day_hours AS (
        SELECT d.WorkDate, COALESCE(dh.OpenTime, l.OpenTime) AS OpenTime, COALESCE(dh.CloseTime, l.CloseTime) AS CloseTime
        FROM dates d
            CROSS JOIN public.Locations l
            LEFT JOIN LATERAL (
                SELECT lds.OpenTime, lds.CloseTime
                FROM public.LocationDaySchedule lds
                WHERE lds.LocationId = l.Id
                    AND lds.DayBit = public.fn_DayBit(d.WorkDate)
                    AND lds.EffectiveFrom <= d.WorkDate
                    AND (lds.EffectiveTo IS NULL OR lds.EffectiveTo >= d.WorkDate) AND lds.IsDelete = FALSE
                ORDER BY CASE WHEN lds.EffectiveTo = lds.EffectiveFrom THEN 1 WHEN lds.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, lds.EffectiveFrom DESC
                LIMIT 1
            ) dh ON TRUE
        WHERE l.Id = p_LocationId AND l.IsDelete = FALSE AND l.IsActive = TRUE
    ),
    target_categories AS (
        SELECT DISTINCT t.CategoryId
        FROM public.Treatments t
            JOIN unnest(p_TreatmentIds) AS ti(Id) ON ti.Id = t.Id
        WHERE t.LocationId = p_LocationId AND t.IsDelete = FALSE AND t.IsActive = TRUE
    ),
    active_rooms AS (
        SELECT r.Id AS RoomId
        FROM public.Rooms r
        WHERE r.LocationId = p_LocationId AND r.IsDelete = FALSE AND r.IsActive = TRUE
    ),
    eligible_rooms AS (
        SELECT d.WorkDate, r.RoomId, rca.ShiftType
        FROM dates d
            CROSS JOIN active_rooms r
            JOIN public.RoomCategoryAssignments rca ON rca.RoomId = r.RoomId AND rca.WorkDate = d.WorkDate AND rca.IsDelete = FALSE AND rca.IsActive = TRUE
        WHERE rca.TreatmentCategoryId IN (SELECT CategoryId FROM target_categories)

        UNION ALL

        SELECT d.WorkDate, r.RoomId, 'FullDay' AS ShiftType
        FROM dates d
            CROSS JOIN active_rooms r
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.RoomCategoryAssignments rca2
                JOIN public.Rooms r2 ON r2.Id = rca2.RoomId
            WHERE r2.LocationId = p_LocationId AND rca2.IsDelete = FALSE AND rca2.IsActive = TRUE
        )
    ),
    eligible_shifts AS (
        SELECT sa.WorkDate, sa.RoomId, sa.TherapistId, sa.ShiftType, sa.StartTime AS ShiftStart, sa.EndTime AS ShiftEnd
        FROM public.ShiftAssignments sa
        WHERE sa.LocationId = p_LocationId AND sa.WorkDate BETWEEN p_FromDate AND p_ToDate AND sa.IsDelete = FALSE AND sa.IsActive = TRUE

        UNION ALL

        -- "Ever" (not "not this date") -- a per-date check here would make a fully
        -- shift-scheduled therapist's day off look available all day in every room, for every
        -- date in the range.
        SELECT d.WorkDate, NULL::int AS RoomId, tp.Id AS TherapistId, 'FullDay' AS ShiftType, dh.OpenTime AS ShiftStart, dh.CloseTime AS ShiftEnd
        FROM dates d
            CROSS JOIN public.TherapistProfile tp
            JOIN day_hours dh ON dh.WorkDate = d.WorkDate
        WHERE tp.IsDelete = FALSE AND tp.IsActive = TRUE
            AND (tp.LocationId = p_LocationId OR tp.LocationId IS NULL)
            AND NOT EXISTS (
                SELECT 1 FROM public.ShiftAssignments sa2
                WHERE sa2.TherapistId = tp.Id AND sa2.IsDelete = FALSE AND sa2.IsActive = TRUE
            )
    )
    SELECT DISTINCT er.RoomId, es.TherapistId, es.ShiftType, es.ShiftStart, es.ShiftEnd, er.WorkDate
    FROM eligible_rooms er
        JOIN eligible_shifts es
        ON es.WorkDate = er.WorkDate
            AND (es.ShiftType = er.ShiftType OR er.ShiftType = 'FullDay' OR es.ShiftType = 'FullDay')
            AND (es.RoomId IS NULL OR es.RoomId = er.RoomId);
$$;

-- 4) scheduled treatment lines on the date, anywhere -- NOT scoped to this location.
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityScheduledLines(p_WorkDate date, p_ExcludeBookingId int DEFAULT NULL)
RETURNS TABLE(RoomId int, TherapistId int, StartTime timestamptz, EndTime timestamptz, Status varchar)
LANGUAGE sql STABLE AS $$
    SELECT bt.RoomId, bt.TherapistId, bt.StartTime, bt.EndTime, b.Status
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date = p_WorkDate
        AND bt.IsDelete = FALSE AND b.IsDelete = FALSE
        AND (p_ExcludeBookingId IS NULL OR b.Id <> p_ExcludeBookingId)
        AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()));
$$;

-- Range-aware sibling of fn_Booking_AvailabilityScheduledLines above -- same "anywhere, not scoped
-- to this location" shape, across the whole range instead of one date.
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityRangeScheduledLines(p_FromDate date, p_ToDate date, p_ExcludeBookingId int DEFAULT NULL)
RETURNS TABLE(RoomId int, TherapistId int, StartTime timestamptz, EndTime timestamptz, Status varchar)
LANGUAGE sql STABLE AS $$
    SELECT bt.RoomId, bt.TherapistId, bt.StartTime, bt.EndTime, b.Status
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date BETWEEN p_FromDate AND p_ToDate
        AND bt.IsDelete = FALSE AND b.IsDelete = FALSE
        AND (p_ExcludeBookingId IS NULL OR b.Id <> p_ExcludeBookingId)
        AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()));
$$;

-- 5) admin-blocked room/time ranges that day (lunch break, therapist leave, etc)
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityBlockedSlots(p_LocationId int, p_WorkDate date)
RETURNS TABLE(RoomId int, StartTime time, EndTime time, WorkDate date)
LANGUAGE sql STABLE AS $$
    SELECT bs.RoomId, bs.StartTime, bs.EndTime, p_WorkDate AS WorkDate
    FROM public.BlockedSlots bs
        JOIN public.Rooms r ON r.Id = bs.RoomId
    WHERE r.LocationId = p_LocationId AND bs.WorkDate = p_WorkDate AND bs.IsDelete = FALSE;
$$;

-- Range-aware sibling of fn_Booking_AvailabilityBlockedSlots above.
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityRangeBlockedSlots(p_LocationId int, p_FromDate date, p_ToDate date)
RETURNS TABLE(RoomId int, StartTime time, EndTime time, WorkDate date)
LANGUAGE sql STABLE AS $$
    SELECT bs.RoomId, bs.StartTime, bs.EndTime, bs.WorkDate
    FROM public.BlockedSlots bs
        JOIN public.Rooms r ON r.Id = bs.RoomId
    WHERE r.LocationId = p_LocationId AND bs.WorkDate BETWEEN p_FromDate AND p_ToDate AND bs.IsDelete = FALSE;
$$;

-------------------------------------------------------------------------------------------------
-- Booking draft lifecycle
-------------------------------------------------------------------------------------------------

-- Creates the draft "cart" the moment treatments are picked, before any date/time exists.
CREATE OR REPLACE FUNCTION public.sp_Booking_HasLocationRoomOpenings(p_LocationId int)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.RoomCategoryAssignments rca
            JOIN public.Rooms r ON r.Id = rca.RoomId
            JOIN public.ShiftAssignments sa ON sa.LocationId = p_LocationId
                AND sa.WorkDate = rca.WorkDate
                AND (sa.ShiftType = rca.ShiftType OR sa.ShiftType = 'FullDay' OR rca.ShiftType = 'FullDay')
                AND (sa.RoomId IS NULL OR sa.RoomId = r.Id)
                AND sa.IsDelete = FALSE AND sa.IsActive = TRUE
            JOIN public.TherapistProfile tp ON tp.Id = sa.TherapistId
                AND tp.IsDelete = FALSE AND tp.IsActive = TRUE
        WHERE r.LocationId = p_LocationId
          AND r.IsDelete = FALSE AND r.IsActive = TRUE
          AND rca.IsDelete = FALSE AND rca.IsActive = TRUE
    );
$$;

-- Dates in [p_FromDate, p_ToDate] that have bookable staff+room capacity. Mirrors
-- fn_Booking_AvailabilityRangeEligiblePairs' room + shift eligibility (minus the treatment-category
-- filter, which the client date picker doesn't know yet) so BookingService.GetAvailableDatesAsync
-- never hard-gates out a date that would actually yield slots. Weekly-mask / holiday / IsClosed
-- filtering stays in the C# caller, same as before.
CREATE OR REPLACE FUNCTION public.sp_Booking_GetLocationOpenDates(p_LocationId int, p_FromDate date, p_ToDate date)
RETURNS TABLE(WorkDate date)
LANGUAGE sql STABLE AS $$
    WITH dates AS (
        SELECT generate_series(p_FromDate, p_ToDate, interval '1 day')::date AS WorkDate
    ),
    active_rooms AS (
        SELECT r.Id AS RoomId
        FROM public.Rooms r
        WHERE r.LocationId = p_LocationId AND r.IsDelete = FALSE AND r.IsActive = TRUE
    ),
    location_has_rca AS (
        SELECT EXISTS (
            SELECT 1
            FROM public.RoomCategoryAssignments rca
                JOIN public.Rooms r ON r.Id = rca.RoomId
            WHERE r.LocationId = p_LocationId AND rca.IsDelete = FALSE AND rca.IsActive = TRUE
        ) AS has_rca
    ),
    eligible_rooms AS (
        -- rooms explicitly opened for the date
        SELECT d.WorkDate, r.RoomId, rca.ShiftType
        FROM dates d
            CROSS JOIN active_rooms r
            JOIN public.RoomCategoryAssignments rca
                ON rca.RoomId = r.RoomId AND rca.WorkDate = d.WorkDate
                AND rca.IsDelete = FALSE AND rca.IsActive = TRUE

        UNION ALL

        -- location that hasn't adopted RCA scheduling at all: every active room works any category
        SELECT d.WorkDate, r.RoomId, 'FullDay'::varchar AS ShiftType
        FROM dates d
            CROSS JOIN active_rooms r
            CROSS JOIN location_has_rca lhr
        WHERE lhr.has_rca = FALSE
    ),
    eligible_shifts AS (
        -- explicit shift assignments on the date (assigned to an active therapist)
        SELECT sa.WorkDate, sa.RoomId, sa.ShiftType
        FROM public.ShiftAssignments sa
            JOIN public.TherapistProfile tp ON tp.Id = sa.TherapistId
                AND tp.IsDelete = FALSE AND tp.IsActive = TRUE
        WHERE sa.LocationId = p_LocationId
            AND sa.WorkDate BETWEEN p_FromDate AND p_ToDate
            AND sa.IsDelete = FALSE AND sa.IsActive = TRUE

        UNION ALL

        -- "floating" therapists: no shift assignments anywhere -> available every date, any room
        SELECT d.WorkDate, NULL::int AS RoomId, 'FullDay'::varchar AS ShiftType
        FROM dates d
            CROSS JOIN public.TherapistProfile tp
        WHERE tp.IsDelete = FALSE AND tp.IsActive = TRUE
            AND (tp.LocationId = p_LocationId OR tp.LocationId IS NULL)
            AND NOT EXISTS (
                SELECT 1 FROM public.ShiftAssignments sa2
                WHERE sa2.TherapistId = tp.Id AND sa2.IsDelete = FALSE AND sa2.IsActive = TRUE
            )
    )
    SELECT DISTINCT er.WorkDate
    FROM eligible_rooms er
        JOIN eligible_shifts es
            ON es.WorkDate = er.WorkDate
            AND (es.ShiftType = er.ShiftType OR er.ShiftType = 'FullDay' OR es.ShiftType = 'FullDay')
            AND (es.RoomId IS NULL OR es.RoomId = er.RoomId)
    ORDER BY er.WorkDate;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_CreateDraft(
    p_LocationId int,
    p_CustomerId int,
    p_Treatments int[],
    p_CreatedBy int DEFAULT NULL,
    OUT p_BookingId int
)
LANGUAGE plpgsql AS $$
DECLARE
    v_Today date := public.fn_UtcToday();
    v_InsertedCount int;
BEGIN
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy)
    VALUES (p_LocationId, p_CustomerId, 'Draft', p_CreatedBy)
    RETURNING Id INTO p_BookingId;

    INSERT INTO public.BookingTreatments
        (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, TreatmentPriceId, TreatmentDurationId, CreatedBy)
    SELECT p_BookingId, t.Id, (ROW_NUMBER() OVER (ORDER BY t.Id))::smallint, cd.DurationSlots, cp.Price, cp.Id, cd.Id, p_CreatedBy
    FROM public.Treatments t
        JOIN unnest(p_Treatments) AS ti(Id) ON ti.Id = t.Id
        JOIN LATERAL (
            SELECT tp.Id, tp.Price FROM public.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= v_Today AND (tp.EffectiveTo IS NULL OR tp.EffectiveTo >= v_Today) AND tp.IsDelete = FALSE
            ORDER BY CASE WHEN tp.EffectiveTo = tp.EffectiveFrom THEN 1 WHEN tp.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, tp.EffectiveFrom DESC
            LIMIT 1
        ) cp ON TRUE
        JOIN LATERAL (
            SELECT td.Id, td.DurationSlots FROM public.TreatmentDurations td
            WHERE td.TreatmentId = t.Id AND td.EffectiveFrom <= v_Today AND (td.EffectiveTo IS NULL OR td.EffectiveTo >= v_Today) AND td.IsDelete = FALSE
            ORDER BY CASE WHEN td.EffectiveTo = td.EffectiveFrom THEN 1 WHEN td.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, td.EffectiveFrom DESC
            LIMIT 1
        ) cd ON TRUE
    WHERE t.LocationId = p_LocationId AND t.IsDelete = FALSE AND t.IsActive = TRUE
        AND t.EffectiveFrom <= v_Today;

    -- The lateral joins silently drop any requested treatment with no currently-effective
    -- price/duration row -- without this check the draft would silently end up with fewer
    -- treatments than the customer actually selected, with no error telling them why.
    SELECT COUNT(*) INTO v_InsertedCount FROM public.BookingTreatments WHERE BookingId = p_BookingId AND IsDelete = FALSE;
    IF v_InsertedCount < COALESCE(array_length(p_Treatments, 1), 0) THEN
        RAISE EXCEPTION 'One or more selected treatments are not currently available for booking.' USING ERRCODE = '50009';
    END IF;
END;
$$;

-- Adds one more (unscheduled) treatment line to an existing draft. Only allowed while the booking
-- is still a Draft the caller owns.
CREATE OR REPLACE FUNCTION public.sp_Booking_AddTreatment(
    p_BookingId int, p_CustomerId int, p_TreatmentId int, p_CreatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_LocationId int;
    v_NextSeq smallint;
    v_Today date := public.fn_UtcToday();
    v_Inserted int;
BEGIN
    SELECT LocationId INTO v_LocationId
    FROM public.Bookings
    WHERE Id = p_BookingId AND CustomerId = p_CustomerId AND IsDelete = FALSE AND Status = 'Draft';

    IF v_LocationId IS NULL THEN
        RAISE EXCEPTION 'Booking not found or not editable.' USING ERRCODE = '50005';
    END IF;

    SELECT COALESCE(MAX(SequenceOrder), 0) + 1 INTO v_NextSeq
    FROM public.BookingTreatments
    WHERE BookingId = p_BookingId;

    INSERT INTO public.BookingTreatments
        (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, TreatmentPriceId, TreatmentDurationId, CreatedBy)
    SELECT p_BookingId, t.Id, v_NextSeq, cd.DurationSlots, cp.Price, cp.Id, cd.Id, p_CreatedBy
    FROM public.Treatments t
        JOIN LATERAL (
            SELECT tp.Id, tp.Price FROM public.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= v_Today AND (tp.EffectiveTo IS NULL OR tp.EffectiveTo >= v_Today) AND tp.IsDelete = FALSE
            ORDER BY CASE WHEN tp.EffectiveTo = tp.EffectiveFrom THEN 1 WHEN tp.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, tp.EffectiveFrom DESC
            LIMIT 1
        ) cp ON TRUE
        JOIN LATERAL (
            SELECT td.Id, td.DurationSlots FROM public.TreatmentDurations td
            WHERE td.TreatmentId = t.Id AND td.EffectiveFrom <= v_Today AND (td.EffectiveTo IS NULL OR td.EffectiveTo >= v_Today) AND td.IsDelete = FALSE
            ORDER BY CASE WHEN td.EffectiveTo = td.EffectiveFrom THEN 1 WHEN td.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, td.EffectiveFrom DESC
            LIMIT 1
        ) cd ON TRUE
    WHERE t.Id = p_TreatmentId AND t.LocationId = v_LocationId AND t.IsDelete = FALSE AND t.IsActive = TRUE
        AND t.EffectiveFrom <= v_Today;

    GET DIAGNOSTICS v_Inserted = ROW_COUNT;
    IF v_Inserted = 0 THEN
        RAISE EXCEPTION 'Treatment not available at this location.' USING ERRCODE = '50006';
    END IF;

    UPDATE public.Bookings SET UpdatedDate = now(), UpdatedBy = p_CreatedBy WHERE Id = p_BookingId;
END;
$$;

-- Removes one treatment line from a draft (soft-delete). Returns the freed (location,room,date) if
-- the line was actually scheduled, so the API can invalidate the availability cache/SSE for it --
-- zero rows if it hadn't been scheduled yet.
CREATE OR REPLACE FUNCTION public.sp_Booking_RemoveTreatment(
    p_BookingId int, p_CustomerId int, p_TreatmentId int, p_UpdatedBy int DEFAULT NULL
)
RETURNS TABLE(LocationId int, RoomId int, WorkDate date)
LANGUAGE plpgsql AS $$
DECLARE
    v_RowCount int;
BEGIN
    CREATE TEMP TABLE removed (LocationId int, RoomId int, StartTime timestamptz) ON COMMIT DROP;

    WITH updated AS (
        UPDATE public.BookingTreatments bt
        SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
        FROM public.Bookings b
        WHERE bt.BookingId = p_BookingId AND bt.TreatmentId = p_TreatmentId AND bt.IsDelete = FALSE
            AND b.Id = bt.BookingId AND b.CustomerId = p_CustomerId AND b.IsDelete = FALSE AND b.Status = 'Draft'
        RETURNING b.LocationId, bt.RoomId, bt.StartTime
    )
    INSERT INTO removed SELECT * FROM updated;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Treatment not found on this booking.' USING ERRCODE = '50007';
    END IF;

    UPDATE public.Bookings SET UpdatedDate = now(), UpdatedBy = p_UpdatedBy WHERE Id = p_BookingId;

    RETURN QUERY
    SELECT r.LocationId, r.RoomId, (r.StartTime AT TIME ZONE 'utc')::date AS WorkDate
    FROM removed r
    WHERE r.RoomId IS NOT NULL;
END;
$$;

-- Server-side re-validation that a room/therapist/time is an actually-eligible combination, not
-- just non-conflicting with another booking. Mirrors EligibleRooms/EligibleShifts's pairing rules
-- (including their legacy/bootstrap fallbacks) and the location-hours/holiday resolution, scoped
-- to just the one room/therapist/time being committed.
CREATE OR REPLACE FUNCTION public.sp_Booking_ValidateSlotEligibility(
    p_LocationId int, p_TreatmentId int, p_RoomId int, p_TherapistId int,
    p_StartTime timestamptz, p_EndTime timestamptz
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_TimeZoneId varchar;
    v_WorkDate date;
    v_DayBit smallint;
    v_CategoryId int;
    v_LocOpenTime time;
    v_LocCloseTime time;
    v_BreakStart time;
    v_BreakEnd time;
    v_IsHoliday boolean;
    v_StartTod time;
    v_EndTod time;
BEGIN
    SELECT t.CategoryId INTO v_CategoryId
    FROM public.Treatments t
    WHERE t.Id = p_TreatmentId AND t.LocationId = p_LocationId AND t.IsDelete = FALSE AND t.IsActive = TRUE;

    IF v_CategoryId IS NULL THEN
        RAISE EXCEPTION 'Treatment not offered at this location.' USING ERRCODE = '50036';
    END IF;

    -- p_StartTime/p_EndTime are true UTC instants (see BookingService.ScheduleTreatmentAsync); every
    -- venue-local concept below (OpenTime/CloseTime, LocationDaySchedule, RoomCategoryAssignments.
    -- WorkDate, ShiftAssignments.WorkDate/StartTime/EndTime) is stated in the location's own zone,
    -- not UTC -- resolve it first so WorkDate/day-bit/time-of-day are derived venue-local, not off a
    -- UTC extraction that drifts from business hours by the venue's own offset.
    SELECT l.TimeZoneId INTO v_TimeZoneId
    FROM public.Locations l
    WHERE l.Id = p_LocationId AND l.IsDelete = FALSE AND l.IsActive = TRUE;

    IF v_TimeZoneId IS NULL THEN
        RAISE EXCEPTION 'Location not found.' USING ERRCODE = '50037';
    END IF;

    v_WorkDate := (p_StartTime AT TIME ZONE v_TimeZoneId)::date;
    v_DayBit := public.fn_DayBit(v_WorkDate);
    v_StartTod := (p_StartTime AT TIME ZONE v_TimeZoneId)::time;
    v_EndTod := (p_EndTime AT TIME ZONE v_TimeZoneId)::time;

    SELECT
        COALESCE(dh.OpenTime, l.OpenTime), COALESCE(dh.CloseTime, l.CloseTime),
        COALESCE(l.BreakStartTime, c.BreakStartTime), COALESCE(l.BreakEndTime, c.BreakEndTime),
        (COALESCE(dh.IsClosed, FALSE) OR EXISTS (
            SELECT 1 FROM public.LocationHolidays h
            WHERE h.LocationId = l.Id AND h.HolidayDate = v_WorkDate AND h.IsDelete = FALSE AND h.IsActive = TRUE
        ))
    INTO v_LocOpenTime, v_LocCloseTime, v_BreakStart, v_BreakEnd, v_IsHoliday
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
        LEFT JOIN LATERAL (
            SELECT ds.OpenTime, ds.CloseTime, ds.IsClosed
            FROM public.LocationDaySchedule ds
            WHERE ds.LocationId = l.Id AND ds.DayBit = v_DayBit AND ds.EffectiveFrom <= v_WorkDate
                AND (ds.EffectiveTo IS NULL OR ds.EffectiveTo >= v_WorkDate) AND ds.IsDelete = FALSE
            ORDER BY CASE WHEN ds.EffectiveTo = ds.EffectiveFrom THEN 1 WHEN ds.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, ds.EffectiveFrom DESC
            LIMIT 1
        ) dh ON TRUE
    WHERE l.Id = p_LocationId AND l.IsDelete = FALSE AND l.IsActive = TRUE;

    IF v_LocOpenTime IS NULL THEN
        RAISE EXCEPTION 'Location not found.' USING ERRCODE = '50037';
    END IF;

    IF v_IsHoliday
        OR v_StartTod < v_LocOpenTime OR v_EndTod > v_LocCloseTime
        OR (v_BreakStart IS NOT NULL AND v_BreakEnd IS NOT NULL AND v_StartTod < v_BreakEnd AND v_EndTod > v_BreakStart)
    THEN
        RAISE EXCEPTION 'Location is not open at the requested time.' USING ERRCODE = '50038';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.Rooms r WHERE r.Id = p_RoomId AND r.LocationId = p_LocationId AND r.IsDelete = FALSE AND r.IsActive = TRUE
    ) THEN
        RAISE EXCEPTION 'Room is not available at this location.' USING ERRCODE = '50039';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.TherapistProfile tp
        WHERE tp.Id = p_TherapistId AND tp.IsDelete = FALSE AND tp.IsActive = TRUE
            AND (tp.LocationId = p_LocationId OR tp.LocationId IS NULL)
    ) THEN
        RAISE EXCEPTION 'Therapist is not available at this location.' USING ERRCODE = '50040';
    END IF;

    -- Room-category eligibility paired with an actual therapist shift window covering the
    -- requested time, unless the location has never adopted room-category assignments at all, or
    -- this therapist has never used shift assignments at all -- both legacy/bootstrap fallbacks,
    -- matching the read path exactly.
    IF EXISTS (
        SELECT 1 FROM public.RoomCategoryAssignments rcaAny
            JOIN public.Rooms rAny ON rAny.Id = rcaAny.RoomId
        WHERE rAny.LocationId = p_LocationId AND rcaAny.IsDelete = FALSE AND rcaAny.IsActive = TRUE
    )
    AND EXISTS (
        SELECT 1 FROM public.ShiftAssignments saAny WHERE saAny.TherapistId = p_TherapistId AND saAny.IsDelete = FALSE AND saAny.IsActive = TRUE
    )
    AND NOT EXISTS (
        SELECT 1
        FROM public.RoomCategoryAssignments rca
            JOIN public.ShiftAssignments sa
                ON (sa.ShiftType = rca.ShiftType OR sa.ShiftType = 'FullDay' OR rca.ShiftType = 'FullDay')
                AND (sa.RoomId IS NULL OR sa.RoomId = rca.RoomId)
        WHERE rca.RoomId = p_RoomId AND rca.WorkDate = v_WorkDate AND rca.TreatmentCategoryId = v_CategoryId
            AND rca.IsDelete = FALSE AND rca.IsActive = TRUE
            AND sa.TherapistId = p_TherapistId AND sa.WorkDate = v_WorkDate AND sa.IsDelete = FALSE AND sa.IsActive = TRUE
            AND v_StartTod >= sa.StartTime AND v_EndTod <= sa.EndTime
    ) THEN
        RAISE EXCEPTION 'This room/therapist/time is not a valid combination for the requested treatment.' USING ERRCODE = '50041';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.BlockedSlots bs
        WHERE bs.RoomId = p_RoomId AND bs.WorkDate = v_WorkDate AND bs.IsDelete = FALSE
            AND bs.StartTime < v_EndTod AND bs.EndTime > v_StartTod
    ) THEN
        RAISE EXCEPTION 'Requested time is blocked.' USING ERRCODE = '50043';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_ScheduleTreatment(
    p_BookingId int, p_CustomerId int, p_TreatmentId int, p_RoomId int, p_TherapistId int,
    p_StartTime timestamptz, p_EndTime timestamptz, p_UpdatedBy int DEFAULT NULL,
    OUT "ExpiresAt" timestamptz, OUT "LocationId" int
)
LANGUAGE plpgsql AS $$
DECLARE
    v_ExpiresAt timestamptz;
    v_LocationId int;
    v_RoomLockKey text := 'room_' || p_RoomId || '_' || to_char(p_StartTime AT TIME ZONE 'utc', 'YYYY-MM-DD');
    v_TherapistLockKey text := 'therapist_' || p_TherapistId || '_' || to_char(p_StartTime AT TIME ZONE 'utc', 'YYYY-MM-DD');
BEGIN
    -- Always acquire the room lock before the therapist lock (every caller, every time) so two
    -- transactions contending on both resources can't deadlock by acquiring them in opposite orders.
    PERFORM public.fn_AcquireBookingLock(v_RoomLockKey);
    PERFORM public.fn_AcquireBookingLock(v_TherapistLockKey);

    SELECT b.LocationId INTO v_LocationId
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = p_BookingId AND bt.TreatmentId = p_TreatmentId AND bt.IsDelete = FALSE
        AND b.CustomerId = p_CustomerId AND b.IsDelete = FALSE AND b.Status = 'Draft'
    LIMIT 1;

    IF v_LocationId IS NULL THEN
        RAISE EXCEPTION 'Booking or treatment not found.' USING ERRCODE = '50008';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId
        WHERE (bt.RoomId = p_RoomId OR bt.TherapistId = p_TherapistId)
            AND bt.IsDelete = FALSE AND b.IsDelete = FALSE
            AND NOT (bt.BookingId = p_BookingId AND bt.TreatmentId = p_TreatmentId)
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
            AND bt.StartTime < p_EndTime AND bt.EndTime > p_StartTime
    ) THEN
        RAISE EXCEPTION 'Slot no longer available.' USING ERRCODE = '50002';
    END IF;

    PERFORM public.sp_Booking_ValidateSlotEligibility(v_LocationId, p_TreatmentId, p_RoomId, p_TherapistId, p_StartTime, p_EndTime);

    v_ExpiresAt := now() + interval '5 minutes';

    UPDATE public.BookingTreatments
    SET RoomId = p_RoomId, TherapistId = p_TherapistId, StartTime = p_StartTime, EndTime = p_EndTime,
        ExpiresAt = v_ExpiresAt, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE BookingId = p_BookingId AND TreatmentId = p_TreatmentId AND IsDelete = FALSE;

    UPDATE public.Bookings SET UpdatedDate = now(), UpdatedBy = p_UpdatedBy WHERE Id = p_BookingId;

    "ExpiresAt" := v_ExpiresAt;
    "LocationId" := v_LocationId;
END;
$$;

-- Admin-side drag-to-reschedule on the appointment calendar: moves one treatment line of an
-- already-Confirmed booking to a new room/therapist/time. No CustomerId param -- caller
-- identity/location-ownership is checked by the admin endpoint before this runs.
CREATE OR REPLACE FUNCTION public.sp_Booking_RescheduleConfirmed(
    p_BookingId int, p_TreatmentId int, p_RoomId int, p_TherapistId int,
    p_StartTime timestamptz, p_EndTime timestamptz, p_UpdatedBy int DEFAULT NULL,
    OUT p_LocationId int
)
LANGUAGE plpgsql AS $$
DECLARE
    v_RoomLockKey text := 'room_' || p_RoomId || '_' || to_char(p_StartTime AT TIME ZONE 'utc', 'YYYY-MM-DD');
    v_TherapistLockKey text := 'therapist_' || p_TherapistId || '_' || to_char(p_StartTime AT TIME ZONE 'utc', 'YYYY-MM-DD');
BEGIN
    PERFORM public.fn_AcquireBookingLock(v_RoomLockKey);
    PERFORM public.fn_AcquireBookingLock(v_TherapistLockKey);

    SELECT b.LocationId INTO p_LocationId
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = p_BookingId AND bt.TreatmentId = p_TreatmentId AND bt.IsDelete = FALSE
        AND b.IsDelete = FALSE AND b.Status = 'Confirmed'
    LIMIT 1;

    IF p_LocationId IS NULL THEN
        RAISE EXCEPTION 'Booking or treatment not found.' USING ERRCODE = '50008';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId
        WHERE (bt.RoomId = p_RoomId OR bt.TherapistId = p_TherapistId)
            AND bt.IsDelete = FALSE AND b.IsDelete = FALSE
            AND NOT (bt.BookingId = p_BookingId AND bt.TreatmentId = p_TreatmentId)
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
            AND bt.StartTime < p_EndTime AND bt.EndTime > p_StartTime
    ) THEN
        RAISE EXCEPTION 'Slot no longer available.' USING ERRCODE = '50002';
    END IF;

    PERFORM public.sp_Booking_ValidateSlotEligibility(p_LocationId, p_TreatmentId, p_RoomId, p_TherapistId, p_StartTime, p_EndTime);

    UPDATE public.BookingTreatments
    SET RoomId = p_RoomId, TherapistId = p_TherapistId, StartTime = p_StartTime, EndTime = p_EndTime,
        UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE BookingId = p_BookingId AND TreatmentId = p_TreatmentId AND IsDelete = FALSE;

    UPDATE public.Bookings SET UpdatedDate = now(), UpdatedBy = p_UpdatedBy WHERE Id = p_BookingId;
END;
$$;

-- Reassign a proxy / alternate therapist for a confirmed booking treatment line. Room/time are
-- unchanged here, only who's doing the treatment -- re-validate just the new therapist against the
-- existing room/time rather than the full location-hours/room checks.
CREATE OR REPLACE FUNCTION public.sp_Booking_ReassignTherapist(
    p_BookingId int, p_TreatmentId int, p_NewTherapistId int, p_Reason varchar(500) DEFAULT NULL,
    p_UpdatedBy int DEFAULT NULL,
    OUT p_LocationId int
)
LANGUAGE plpgsql AS $$
DECLARE
    v_StartTime timestamptz;
    v_EndTime timestamptz;
    v_RoomId int;
    v_TherapistLockKey text;
BEGIN
    SELECT b.LocationId, bt.StartTime, bt.EndTime, bt.RoomId
    INTO p_LocationId, v_StartTime, v_EndTime, v_RoomId
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = p_BookingId AND bt.TreatmentId = p_TreatmentId AND bt.IsDelete = FALSE
        AND b.IsDelete = FALSE AND b.Status = 'Confirmed'
    LIMIT 1;

    IF p_LocationId IS NULL THEN
        RAISE EXCEPTION 'Booking or treatment not found or not confirmed.' USING ERRCODE = '50008';
    END IF;

    v_TherapistLockKey := 'therapist_' || p_NewTherapistId || '_' || to_char(v_StartTime AT TIME ZONE 'utc', 'YYYY-MM-DD');
    PERFORM public.fn_AcquireBookingLock(v_TherapistLockKey);

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId
        WHERE bt.TherapistId = p_NewTherapistId
            AND bt.IsDelete = FALSE AND b.IsDelete = FALSE
            AND NOT (bt.BookingId = p_BookingId AND bt.TreatmentId = p_TreatmentId)
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
            AND bt.StartTime < v_EndTime AND bt.EndTime > v_StartTime
    ) THEN
        RAISE EXCEPTION 'Alternate therapist is not available for this time slot.' USING ERRCODE = '50002';
    END IF;

    PERFORM public.sp_Booking_ValidateSlotEligibility(p_LocationId, p_TreatmentId, v_RoomId, p_NewTherapistId, v_StartTime, v_EndTime);

    UPDATE public.BookingTreatments
    SET TherapistId = p_NewTherapistId, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE BookingId = p_BookingId AND TreatmentId = p_TreatmentId AND IsDelete = FALSE;

    UPDATE public.Bookings SET UpdatedDate = now(), UpdatedBy = p_UpdatedBy WHERE Id = p_BookingId;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_Delete(p_BookingId int, p_CustomerId int DEFAULT NULL, p_UpdatedBy int DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM public.BookingTreatments WHERE BookingId = p_BookingId;
    DELETE FROM public.Payments WHERE BookingId = p_BookingId;
    DELETE FROM public.Bookings WHERE Id = p_BookingId AND (p_CustomerId IS NULL OR CustomerId = p_CustomerId);
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_Confirm(p_BookingId int, p_CustomerId int, p_UpdatedBy int DEFAULT NULL)
RETURNS TABLE(LocationId int, RoomId int, WorkDate date)
LANGUAGE plpgsql AS $$
DECLARE
    v_BoundCustomerId int;
    v_BoundLocationId int;
    v_BoundCreatedBy int := COALESCE(p_UpdatedBy, p_CustomerId);
BEGIN
    IF p_CustomerId IS NULL OR p_CustomerId <= 0 THEN
        RAISE EXCEPTION 'CustomerId is required.' USING ERRCODE = '50003';
    END IF;

    IF EXISTS (SELECT 1 FROM public.Bookings b WHERE b.Id = p_BookingId AND b.Status = 'Confirmed' AND b.IsDelete = FALSE) THEN
        RETURN QUERY
        SELECT b.LocationId, bt.RoomId, (bt.StartTime AT TIME ZONE 'utc')::date AS WorkDate
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId
        WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.Bookings b
        WHERE b.Id = p_BookingId AND b.CustomerId = p_CustomerId AND b.IsDelete = FALSE AND b.Status = 'Draft'
    ) THEN
        RAISE EXCEPTION 'Booking not found or already finalized.' USING ERRCODE = '50003';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.BookingTreatments bt WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Booking has no treatments.' USING ERRCODE = '50003';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.BookingTreatments bt
        WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE AND bt.StartTime IS NULL
    ) THEN
        RAISE EXCEPTION 'Every treatment needs a time before confirming.' USING ERRCODE = '50003';
    END IF;

    UPDATE public.Bookings b
    SET Status = 'Confirmed', UpdatedBy = COALESCE(p_UpdatedBy, p_CustomerId), UpdatedDate = now()
    WHERE b.Id = p_BookingId;

    -- A booking only ever binds the customer to the location once it's actually confirmed.
    SELECT b.CustomerId, b.LocationId INTO v_BoundCustomerId, v_BoundLocationId FROM public.Bookings b WHERE b.Id = p_BookingId;
    PERFORM public.sp_CustomerLocation_Bind(v_BoundCustomerId, v_BoundLocationId, v_BoundCreatedBy);

    -- Retail stock check + deduction, atomic with the confirm -- a booking never commits to
    -- selling more than what's actually on the shelf. Draft never touches stock.
    IF EXISTS (
        SELECT 1
        FROM public.BookingProducts bp
            JOIN public.Products p ON p.Id = bp.ProductId
        WHERE bp.BookingId = p_BookingId AND bp.IsDelete = FALSE AND p.QuantityOnHand < bp.Quantity
    ) THEN
        RAISE EXCEPTION 'Not enough stock for one or more products in this booking.' USING ERRCODE = '50052';
    END IF;

    UPDATE public.Products p
    SET QuantityOnHand = p.QuantityOnHand - bp.Quantity, UpdatedDate = now()
    FROM public.BookingProducts bp
    WHERE bp.ProductId = p.Id AND bp.BookingId = p_BookingId AND bp.IsDelete = FALSE;

    UPDATE public.BookingTreatments bt
    SET ExpiresAt = NULL, UpdatedBy = COALESCE(p_UpdatedBy, p_CustomerId), UpdatedDate = now()
    WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE;

    RETURN QUERY
    SELECT b.LocationId, bt.RoomId, (bt.StartTime AT TIME ZONE 'utc')::date AS WorkDate
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE;
END;
$$;

-- Backs the confirmation email -- separate from sp_Booking_Confirm's own return value because the
-- email needs customer/location names and each treatment's own therapist/time.
CREATE OR REPLACE FUNCTION public.fn_Booking_ConfirmationHeader(p_BookingId int)
RETURNS TABLE(Id int, LocationId int, LocationName varchar, CustomerId int, CustomerName varchar, CustomerEmail varchar)
LANGUAGE sql STABLE AS $$
    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.CustomerId, c.Name AS CustomerName, c.Email AS CustomerEmail
    FROM public.Bookings b
        JOIN public.Users c ON c.Id = b.CustomerId
        JOIN public.Locations l ON l.Id = b.LocationId
    WHERE b.Id = p_BookingId AND b.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.fn_Booking_ConfirmationTreatments(p_BookingId int)
RETURNS TABLE(BookingTreatmentId int, TreatmentId int, TreatmentName varchar, DurationSlots smallint, PreTimeMinutes smallint, Price numeric,
              StartTime timestamptz, EndTime timestamptz, RoomId int, RoomName varchar, TherapistId int, TherapistName varchar)
LANGUAGE sql STABLE AS $$
    -- COALESCE against bt.SlotCount (NOT NULL, the same DurationSlots value denormalized onto the
    -- line at booking time -- see sp_Booking_CreateDraft) -- td.DurationSlots is NULL for any
    -- booking whose TreatmentDurationId never got backfilled (legacy data), which would otherwise
    -- crash Dapper materializing this into ConfirmationTreatmentLineDto's non-nullable short.
    SELECT bt.Id AS BookingTreatmentId, bt.TreatmentId, t.Name AS TreatmentName,
        COALESCE(td.DurationSlots, bt.SlotCount) AS DurationSlots, COALESCE(td.PreTimeMinutes, 0) AS PreTimeMinutes, bt.Price,
        bt.StartTime, bt.EndTime, bt.RoomId, r.Name AS RoomName, bt.TherapistId, th.Name AS TherapistName
    FROM public.BookingTreatments bt
        JOIN public.Treatments t ON t.Id = bt.TreatmentId
        LEFT JOIN public.TreatmentDurations td ON td.Id = bt.TreatmentDurationId
        LEFT JOIN public.Rooms r ON r.Id = bt.RoomId
        JOIN public.TherapistProfile th ON th.Id = bt.TherapistId
    WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE
    ORDER BY bt.SequenceOrder;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_Cancel(
    p_BookingId int, p_CustomerId int, p_UpdatedBy int DEFAULT NULL, p_BypassCancellationWindow boolean DEFAULT FALSE
)
RETURNS TABLE(LocationId int, RoomId int, WorkDate date)
LANGUAGE plpgsql AS $$
DECLARE
    v_EarliestStartTime timestamptz;
    v_PriorStatus varchar(10);
    v_RowCount int;
    v_IsPaid boolean;
BEGIN
    -- 48-hour (2-day) cancellation policy: skipped entirely for staff cancelling on a customer's
    -- behalf via emulation (p_BypassCancellationWindow, set by BookingRepository from
    -- ICurrentUser.EmulatedByUserId -- not something this function can see on its own), and for a
    -- booking with no succeeded payment -- the window exists to protect revenue already collected,
    -- so an unpaid booking has nothing to protect.
    IF NOT p_BypassCancellationWindow THEN
        SELECT EXISTS (
            SELECT 1 FROM public.Payments pay
            WHERE pay.BookingId = p_BookingId AND pay.Status = 'Succeeded' AND pay.IsDelete = FALSE
        ) INTO v_IsPaid;

        IF v_IsPaid THEN
            SELECT MIN(StartTime) INTO v_EarliestStartTime
            FROM public.BookingTreatments
            WHERE BookingId = p_BookingId AND IsDelete = FALSE AND StartTime IS NOT NULL;

            IF v_EarliestStartTime IS NOT NULL AND v_EarliestStartTime <= now() + interval '48 hours' THEN
                RAISE EXCEPTION 'Bookings cannot be cancelled within 48 hours (2 days) of the appointment date.' USING ERRCODE = '50005';
            END IF;
        END IF;
    END IF;

    -- Only a Confirmed booking ever deducted stock -- restocking a Draft cancel would add
    -- inventory back that was never actually removed.
    SELECT Status INTO v_PriorStatus FROM public.Bookings WHERE Id = p_BookingId AND IsDelete = FALSE;

    UPDATE public.Bookings
    SET Status = 'Cancelled', UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_BookingId AND CustomerId = p_CustomerId AND IsDelete = FALSE
        AND Status IN ('Draft','Confirmed');

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Booking not found.' USING ERRCODE = '50004';
    END IF;

    IF v_PriorStatus = 'Confirmed' THEN
        UPDATE public.Products p
        SET QuantityOnHand = p.QuantityOnHand + bp.Quantity, UpdatedDate = now()
        FROM public.BookingProducts bp
        WHERE bp.ProductId = p.Id AND bp.BookingId = p_BookingId AND bp.IsDelete = FALSE;
    END IF;

    RETURN QUERY
    SELECT b.LocationId, bt.RoomId, (bt.StartTime AT TIME ZONE 'utc')::date AS WorkDate
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE AND bt.StartTime IS NOT NULL;
END;
$$;

-- Called every ~30s by a background job. Sweeps expired treatment LINES back to unscheduled
-- rather than deleting them or touching the booking's Status. Returns the (location,room,date)
-- tuples that freed up so the API can invalidate the availability cache and nudge SSE subscribers.
CREATE OR REPLACE FUNCTION public.sp_Booking_ExpireStaleHolds()
RETURNS TABLE(LocationId int, RoomId int, WorkDate date)
LANGUAGE plpgsql AS $$
BEGIN
    CREATE TEMP TABLE expired (LocationId int, RoomId int, WorkDate date) ON COMMIT DROP;
    CREATE TEMP TABLE stale_booking_ids (Id int) ON COMMIT DROP;

    -- Snapshot the about-to-be-cleared rows first (Postgres RETURNING only ever exposes the
    -- post-update row, unlike T-SQL's OUTPUT deleted.*, so the old RoomId/StartTime must be read
    -- before the UPDATE blanks them).
    INSERT INTO expired (LocationId, RoomId, WorkDate)
    SELECT b.LocationId, bt.RoomId, (bt.StartTime AT TIME ZONE 'utc')::date
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE b.Status = 'Draft' AND bt.IsDelete = FALSE
        AND bt.ExpiresAt IS NOT NULL AND bt.ExpiresAt <= now();

    UPDATE public.BookingTreatments bt
    SET RoomId = NULL, TherapistId = NULL, StartTime = NULL, EndTime = NULL, ExpiresAt = NULL,
        UpdatedDate = now()
    FROM public.Bookings b
    WHERE b.Id = bt.BookingId AND b.Status = 'Draft' AND bt.IsDelete = FALSE
        AND bt.ExpiresAt IS NOT NULL AND bt.ExpiresAt <= now();

    -- Delete unpaid payment records older than 30 minutes
    DELETE FROM public.Payments
    WHERE Status <> 'Succeeded'
        AND CreatedDate <= now() - interval '30 minutes';

    -- Delete draft bookings inactive/unpaid for 30+ minutes from database
    INSERT INTO stale_booking_ids (Id)
    SELECT Id FROM public.Bookings
    WHERE Status = 'Draft'
        AND COALESCE(UpdatedDate, CreatedDate) <= now() - interval '30 minutes';

    DELETE FROM public.Payments WHERE BookingId IN (SELECT Id FROM stale_booking_ids);
    DELETE FROM public.BookingTreatments WHERE BookingId IN (SELECT Id FROM stale_booking_ids);
    DELETE FROM public.Bookings WHERE Id IN (SELECT Id FROM stale_booking_ids);

    RETURN QUERY SELECT DISTINCT e.LocationId, e.RoomId, e.WorkDate FROM expired e;
END;
$$;

-- Powers refresh-restore: the booking id lives in the URL, so a reload just re-fetches the
-- current state of the draft from here instead of trusting anything client-persisted.
CREATE OR REPLACE FUNCTION public.fn_Booking_GetByIdHeader(p_BookingId int, p_CustomerId int)
RETURNS TABLE(Id int, LocationId int, LocationName varchar, Status varchar)
LANGUAGE sql STABLE AS $$
    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.Status
    FROM public.Bookings b
        JOIN public.Locations l ON l.Id = b.LocationId
    WHERE b.Id = p_BookingId AND b.CustomerId = p_CustomerId AND b.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.fn_Booking_GetByIdTreatments(p_BookingId int)
RETURNS TABLE(BookingTreatmentId int, TreatmentId int, TreatmentName varchar, DurationSlots smallint, PreTimeMinutes smallint, Price numeric,
              StartTime timestamptz, EndTime timestamptz, RoomId int, RoomName varchar, TherapistId int, TherapistName varchar, ExpiresAt timestamptz)
LANGUAGE sql STABLE AS $$
    -- COALESCE against bt.SlotCount, see fn_Booking_ConfirmationTreatments for why.
    SELECT bt.Id AS BookingTreatmentId, bt.TreatmentId, t.Name AS TreatmentName,
        COALESCE(td.DurationSlots, bt.SlotCount) AS DurationSlots, COALESCE(td.PreTimeMinutes, 0) AS PreTimeMinutes, bt.Price,
        bt.StartTime, bt.EndTime, bt.RoomId, r.Name AS RoomName, bt.TherapistId, th.Name AS TherapistName, bt.ExpiresAt
    FROM public.BookingTreatments bt
        JOIN public.Treatments t ON t.Id = bt.TreatmentId
        LEFT JOIN public.TreatmentDurations td ON td.Id = bt.TreatmentDurationId
        LEFT JOIN public.Rooms r ON r.Id = bt.RoomId
        LEFT JOIN public.TherapistProfile th ON th.Id = bt.TherapistId
    WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE
    ORDER BY bt.SequenceOrder;
$$;

CREATE OR REPLACE FUNCTION public.fn_Booking_MineHeaders(p_CustomerId int, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(BookingId int, LocationId int, LocationName varchar, Status varchar, CreatedDate timestamptz,
              AppointmentStatusId int, AppointmentStatusName varchar, AppointmentStatusColorHex varchar,
              CancelReasonId int, CancelReasonName varchar, PaymentStatus varchar, PaymentProvider varchar)
LANGUAGE sql STABLE AS $$
    SELECT b.Id AS BookingId, b.LocationId, l.Name AS LocationName, b.Status, b.CreatedDate,
        b.AppointmentStatusId, aps.Name AS AppointmentStatusName, aps.ColorHex AS AppointmentStatusColorHex,
        b.CancelReasonId, cr.Name AS CancelReasonName,
        p.Status AS PaymentStatus, p.Provider AS PaymentProvider
    FROM public.Bookings b
        JOIN public.Locations l ON l.Id = b.LocationId
        LEFT JOIN public.AppointmentStatuses aps ON aps.Id = b.AppointmentStatusId
        LEFT JOIN public.CancelReasons cr ON cr.Id = b.CancelReasonId
        LEFT JOIN LATERAL (
            SELECT pay.Provider, pay.Status
            FROM public.Payments pay
            WHERE pay.BookingId = b.Id
            ORDER BY pay.Id DESC
            LIMIT 1
        ) p ON TRUE
    WHERE b.CustomerId = p_CustomerId
        AND (p_ChainId IS NULL OR l.ChainId = p_ChainId)
        AND (p_LocationId IS NULL OR b.LocationId = p_LocationId)
        AND (b.Status IN ('Confirmed', 'Cancelled') OR (b.Status = 'Draft' AND COALESCE(b.UpdatedDate, b.CreatedDate) > now() - interval '30 minutes'))
        AND b.IsDelete = FALSE
    ORDER BY b.Id DESC;
$$;

CREATE OR REPLACE FUNCTION public.fn_Booking_MineTreatments(p_CustomerId int, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(BookingId int, TreatmentName varchar, Price numeric, StartTime timestamptz, EndTime timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT bt.BookingId, t.Name AS TreatmentName, bt.Price, bt.StartTime, bt.EndTime
    FROM public.BookingTreatments bt
        JOIN public.Treatments t ON t.Id = bt.TreatmentId
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN public.Locations l ON l.Id = b.LocationId
    WHERE b.CustomerId = p_CustomerId
        AND (p_ChainId IS NULL OR l.ChainId = p_ChainId)
        AND (p_LocationId IS NULL OR b.LocationId = p_LocationId)
        AND (b.Status IN ('Confirmed', 'Cancelled') OR (b.Status = 'Draft' AND COALESCE(b.UpdatedDate, b.CreatedDate) > now() - interval '15 minutes'))
        AND b.IsDelete = FALSE AND bt.IsDelete = FALSE;
$$;

-------------------------------------------------------------------------------------------------
-- Auth
-------------------------------------------------------------------------------------------------

-- Shared by self-registration (Role='Customer', p_CreatedBy=NULL) and admin-created logins.
CREATE OR REPLACE FUNCTION public.sp_Auth_CreateUser(
    p_Name varchar(200), p_Email varchar(256), p_PasswordHash bytea, p_PasswordSalt bytea,
    p_Phone varchar(30) DEFAULT NULL, p_Role varchar(20) DEFAULT 'Customer',
    p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL, p_TherapistId int DEFAULT NULL,
    p_IsEmulator boolean DEFAULT FALSE, p_JoiningDate date DEFAULT NULL, p_CreatedBy int DEFAULT NULL,
    p_IsEmailVerified boolean DEFAULT FALSE, p_IsWalkIn boolean DEFAULT FALSE,
    OUT p_UserId int
)
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.Users WHERE Email = p_Email AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Email already registered.' USING ERRCODE = '50010';
    END IF;

    -- Defense in depth alongside AdminStaffEndpoints' C#-side clamp -- IsEmulator only ever applies
    -- to RootSuperAdmin/SuperAdmin/Admin.
    INSERT INTO public.Users
        (Name, Email, PasswordHash, PasswordSalt, Phone, Role, ChainId, LocationId, TherapistId, IsEmulator, JoiningDate, IsWalkIn, CreatedBy, IsEmailVerified)
    VALUES
        (
            p_Name, p_Email, p_PasswordHash, p_PasswordSalt, p_Phone, p_Role, p_ChainId, p_LocationId, p_TherapistId,
            CASE WHEN p_Role IN ('RootSuperAdmin', 'SuperAdmin', 'Admin') THEN p_IsEmulator ELSE FALSE END,
            p_JoiningDate, p_IsWalkIn, p_CreatedBy, p_IsEmailVerified
        )
    RETURNING Id INTO p_UserId;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_GetUserByEmail(p_Email varchar(256))
RETURNS TABLE(Id int, Name varchar, Email varchar, PasswordHash bytea, PasswordSalt bytea, Role varchar,
              ChainId int, LocationId int, TherapistId int, IsEmulator boolean, StripeCustomerId varchar,
              PhotoPath varchar, IsEmailVerified boolean)
LANGUAGE sql STABLE AS $$
    SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.PasswordSalt, u.Role, u.ChainId, u.LocationId, u.TherapistId,
        u.IsEmulator, u.StripeCustomerId, COALESCE(sp.PhotoPath, u.ProfilePhoto) AS PhotoPath, u.IsEmailVerified
    FROM public.Users u
        LEFT JOIN public.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Email = p_Email AND u.IsDelete = FALSE AND u.IsActive = TRUE;
$$;

-- Backs the emulation exchange: looks up the emulating staff member (to check IsEmulator) and the
-- target customer, both by id.
CREATE OR REPLACE FUNCTION public.sp_Auth_GetUserById(p_Id int)
RETURNS TABLE(Id int, Name varchar, Email varchar, PasswordHash bytea, PasswordSalt bytea, Role varchar,
              ChainId int, LocationId int, TherapistId int, IsEmulator boolean, StripeCustomerId varchar,
              PhotoPath varchar, IsEmailVerified boolean)
LANGUAGE sql STABLE AS $$
    SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.PasswordSalt, u.Role, u.ChainId, u.LocationId, u.TherapistId,
        u.IsEmulator, u.StripeCustomerId, COALESCE(sp.PhotoPath, u.ProfilePhoto) AS PhotoPath, u.IsEmailVerified
    FROM public.Users u
        LEFT JOIN public.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Id = p_Id AND u.IsDelete = FALSE AND u.IsActive = TRUE;
$$;

-- Same shape as sp_Auth_GetUserById but without the IsActive filter -- correct for
-- AdminStaffEndpoints' PUT existence check, which otherwise 404s on any deactivated staff member.
CREATE OR REPLACE FUNCTION public.sp_Admin_GetUserById(p_Id int)
RETURNS TABLE(Id int, Name varchar, Email varchar, PasswordHash bytea, PasswordSalt bytea, Role varchar,
              ChainId int, LocationId int, TherapistId int, IsEmulator boolean, StripeCustomerId varchar,
              PhotoPath varchar, IsEmailVerified boolean)
LANGUAGE sql STABLE AS $$
    SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.PasswordSalt, u.Role, u.ChainId, u.LocationId, u.TherapistId,
        u.IsEmulator, u.StripeCustomerId, COALESCE(sp.PhotoPath, u.ProfilePhoto) AS PhotoPath, u.IsEmailVerified
    FROM public.Users u
        LEFT JOIN public.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Id = p_Id AND u.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_CreateRefreshToken(p_UserId int, p_TokenHash bytea, p_ExpiresAt timestamptz, OUT p_Id int)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.RefreshTokens (UserId, TokenHash, ExpiresAt)
    VALUES (p_UserId, p_TokenHash, p_ExpiresAt)
    RETURNING Id INTO p_Id;
END;
$$;

-- Backs both /api/auth/refresh and /api/auth/logout -- joins straight through to Users so
-- AuthService can re-mint an access token from one round trip. Caller checks
-- ExpiresAt/RevokedDate before trusting the row.
CREATE OR REPLACE FUNCTION public.sp_Auth_GetRefreshToken(p_TokenHash bytea)
RETURNS TABLE(Id int, UserId int, ExpiresAt timestamptz, RevokedDate timestamptz,
              Name varchar, Email varchar, Role varchar, ChainId int, LocationId int, TherapistId int,
              IsEmulator boolean, IsEmailVerified boolean)
LANGUAGE sql STABLE AS $$
    SELECT rt.Id, rt.UserId, rt.ExpiresAt, rt.RevokedDate,
        u.Name, u.Email, u.Role, u.ChainId, u.LocationId, u.TherapistId, u.IsEmulator, u.IsEmailVerified
    FROM public.RefreshTokens rt
        JOIN public.Users u ON u.Id = rt.UserId
    WHERE rt.TokenHash = p_TokenHash AND u.IsDelete = FALSE AND u.IsActive = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_RevokeRefreshToken(p_Id int) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.RefreshTokens SET RevokedDate = now()
    WHERE Id = p_Id AND RevokedDate IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_RevokeAllRefreshTokens(p_UserId int) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.RefreshTokens SET RevokedDate = now()
    WHERE UserId = p_UserId AND RevokedDate IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_CreatePasswordResetToken(p_UserId int, p_TokenHash bytea, p_ExpiresAt timestamptz, OUT p_Id int)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.PasswordResetTokens (UserId, TokenHash, ExpiresAt)
    VALUES (p_UserId, p_TokenHash, p_ExpiresAt)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_GetPasswordResetToken(p_TokenHash bytea)
RETURNS TABLE(Id int, UserId int, ExpiresAt timestamptz, ResetDate timestamptz, Name varchar, Email varchar)
LANGUAGE sql STABLE AS $$
    SELECT prt.Id, prt.UserId, prt.ExpiresAt, prt.ResetDate, u.Name, u.Email
    FROM public.PasswordResetTokens prt
        JOIN public.Users u ON u.Id = prt.UserId
    WHERE prt.TokenHash = p_TokenHash AND u.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_ConsumePasswordResetToken(p_Id int) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.PasswordResetTokens SET ResetDate = now()
    WHERE Id = p_Id AND ResetDate IS NULL;
$$;

-- Self-service and admin-triggered password changes both land here -- deliberately narrow, never
-- touches Role/scope/IsActive.
CREATE OR REPLACE FUNCTION public.sp_Auth_UpdatePassword(p_UserId int, p_PasswordHash bytea, p_PasswordSalt bytea) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Users
    SET PasswordHash = p_PasswordHash, PasswordSalt = p_PasswordSalt, UpdatedDate = now()
    WHERE Id = p_UserId AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'User not found.' USING ERRCODE = '50044';
    END IF;
END;
$$;

-- Self-service "change email" flow, same opaque/hashed/single-use pattern as the password-reset
-- token procs above. p_Id <> p_UserId lets a caller re-request verification for their own current
-- (unverified) address without tripping over their own row.
CREATE OR REPLACE FUNCTION public.sp_Auth_CreateEmailChangeToken(
    p_UserId int, p_NewEmail varchar(256), p_TokenHash bytea, p_ExpiresAt timestamptz, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.Users WHERE Email = p_NewEmail AND IsDelete = FALSE AND Id <> p_UserId) THEN
        RAISE EXCEPTION 'That email address is already in use.' USING ERRCODE = '50045';
    END IF;

    INSERT INTO public.EmailChangeTokens (UserId, NewEmail, TokenHash, ExpiresAt)
    VALUES (p_UserId, p_NewEmail, p_TokenHash, p_ExpiresAt)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Auth_GetEmailChangeToken(p_TokenHash bytea)
RETURNS TABLE(Id int, UserId int, NewEmail varchar, ExpiresAt timestamptz, ConfirmedDate timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT Id, UserId, NewEmail, ExpiresAt, ConfirmedDate
    FROM public.EmailChangeTokens
    WHERE TokenHash = p_TokenHash;
$$;

-- Applies the staged email once the link mailed to NewEmail is clicked. The uniqueness re-check
-- and the Users.Email update happen in the same function call so a second account can't grab
-- p_NewEmail in the gap between the check and the write.
CREATE OR REPLACE FUNCTION public.sp_Auth_ConfirmEmailChange(p_Id int, p_UserId int, p_NewEmail varchar(256)) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.Users WHERE Email = p_NewEmail AND IsDelete = FALSE AND Id <> p_UserId) THEN
        RAISE EXCEPTION 'That email address is already in use.' USING ERRCODE = '50046';
    END IF;

    UPDATE public.Users SET Email = p_NewEmail, IsEmailVerified = TRUE, UpdatedDate = now()
    WHERE Id = p_UserId AND IsDelete = FALSE;

    UPDATE public.EmailChangeTokens SET ConfirmedDate = now()
    WHERE Id = p_Id AND ConfirmedDate IS NULL;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Staff (Users) management
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_Admin_GetUsers(p_Role varchar(20) DEFAULT NULL, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, Name varchar, Email varchar, Phone varchar, Role varchar, ChainId int, LocationId int,
              TherapistId int, IsEmulator boolean, IsActive boolean, JoiningDate date, CreatedDate timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT Id, Name, Email, Phone, Role, ChainId, LocationId, TherapistId, IsEmulator, IsActive, JoiningDate, CreatedDate
    FROM public.Users
    WHERE IsDelete = FALSE
        AND ((p_Role IS NULL AND Role <> 'Customer') OR Role = p_Role)
        AND (p_ChainId IS NULL OR ChainId = p_ChainId)
        AND (p_LocationId IS NULL OR LocationId = p_LocationId)
    ORDER BY Role, Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_UpdateUser(
    p_Id int, p_Name varchar(200), p_Phone varchar(30) DEFAULT NULL, p_Role varchar(20) DEFAULT NULL,
    p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL, p_TherapistId int DEFAULT NULL,
    p_IsEmulator boolean DEFAULT FALSE, p_JoiningDate date DEFAULT NULL,
    p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    -- IsEmulator only ever applies to RootSuperAdmin/SuperAdmin/Admin, enforced here (not just
    -- trusted from the caller) so login's CanEmulate and the emulate exchange stay consistent no
    -- matter what was requested.
    UPDATE public.Users
    SET Name = p_Name, Phone = p_Phone, Role = COALESCE(p_Role, Role), ChainId = p_ChainId, LocationId = p_LocationId,
        TherapistId = p_TherapistId,
        IsEmulator = CASE WHEN COALESCE(p_Role, Role) IN ('RootSuperAdmin', 'SuperAdmin', 'Admin') THEN p_IsEmulator ELSE FALSE END,
        JoiningDate = COALESCE(p_JoiningDate, JoiningDate),
        IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE AND Role <> 'Customer';

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Staff user not found.' USING ERRCODE = '50020';
    END IF;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Catalog: chains / locations / treatment categories / treatments
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_Admin_GetChains(p_ChainId int DEFAULT NULL)
RETURNS TABLE(Id int, Name varchar, BreakStartTime time, BreakEndTime time, IsActive boolean)
LANGUAGE sql STABLE AS $$
    SELECT Id, Name, BreakStartTime, BreakEndTime, IsActive
    FROM public.SaloonChains
    WHERE IsDelete = FALSE AND (p_ChainId IS NULL OR Id = p_ChainId)
    ORDER BY Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_GetLocations(p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, ChainId int, Name varchar, Address varchar, Latitude numeric, Longitude numeric,
              OpenTime time, CloseTime time, BreakStartTime time, BreakEndTime time,
              WorkingDaysMask smallint, TimeZoneId varchar, IsActive boolean)
LANGUAGE sql STABLE AS $$
    SELECT l.Id, l.ChainId, l.Name, l.Address, l.Latitude, l.Longitude,
           l.OpenTime, l.CloseTime,
           COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask, l.TimeZoneId, l.IsActive
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
    WHERE l.IsDelete = FALSE
        AND (p_ChainId IS NULL OR l.ChainId = p_ChainId)
        AND (p_LocationId IS NULL OR l.Id = p_LocationId)
    ORDER BY l.Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_GetTreatments(p_LocationId int)
RETURNS TABLE(Id int, CategoryId int, CategoryName varchar, Name varchar, Description varchar,
              Price numeric, DurationSlots smallint, PreTimeMinutes smallint, EffectiveFrom date, IsActive boolean)
LANGUAGE sql STABLE AS $$
    SELECT t.Id, t.CategoryId, tc.Name AS CategoryName, t.Name, t.Description, cp.Price, cd.DurationSlots, cd.PreTimeMinutes, t.EffectiveFrom, t.IsActive
    FROM public.Treatments t
        JOIN public.TreatmentCategories tc ON tc.Id = t.CategoryId
        LEFT JOIN LATERAL (
            SELECT tp.Price FROM public.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= public.fn_UtcToday() AND (tp.EffectiveTo IS NULL OR tp.EffectiveTo >= public.fn_UtcToday()) AND tp.IsDelete = FALSE
            ORDER BY CASE WHEN tp.EffectiveTo = tp.EffectiveFrom THEN 1 WHEN tp.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, tp.EffectiveFrom DESC
            LIMIT 1
        ) cp ON TRUE
        LEFT JOIN LATERAL (
            SELECT td.DurationSlots, td.PreTimeMinutes FROM public.TreatmentDurations td
            WHERE td.TreatmentId = t.Id AND td.EffectiveFrom <= public.fn_UtcToday() AND (td.EffectiveTo IS NULL OR td.EffectiveTo >= public.fn_UtcToday()) AND td.IsDelete = FALSE
            ORDER BY CASE WHEN td.EffectiveTo = td.EffectiveFrom THEN 1 WHEN td.EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, td.EffectiveFrom DESC
            LIMIT 1
        ) cd ON TRUE
    WHERE t.LocationId = p_LocationId AND t.IsDelete = FALSE
    ORDER BY tc.Name, t.Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_CreateChain(
    p_Name varchar(200), p_BreakStartTime time DEFAULT NULL, p_BreakEndTime time DEFAULT NULL,
    p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.SaloonChains (Name, BreakStartTime, BreakEndTime, CreatedBy)
    VALUES (p_Name, p_BreakStartTime, p_BreakEndTime, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateChain(
    p_Id int, p_Name varchar(200), p_BreakStartTime time DEFAULT NULL, p_BreakEndTime time DEFAULT NULL,
    p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.SaloonChains
    SET Name = p_Name, BreakStartTime = p_BreakStartTime, BreakEndTime = p_BreakEndTime,
        IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Chain not found.' USING ERRCODE = '50021';
    END IF;
END;
$$;

-- First real (soft-)delete in the app. No cascade: a deleted chain's locations keep IsDelete=FALSE
-- and simply become unreachable through normal admin nav, same as deactivation.
CREATE OR REPLACE FUNCTION public.sp_Catalog_DeleteChain(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.SaloonChains
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Chain not found.' USING ERRCODE = '50021';
    END IF;
END;
$$;

-- Coordinates are plain Latitude/Longitude columns on public.Locations (01_table_postgres.sql) --
-- no PostGIS geography() construction needed, unlike the T-SQL geography::Point(...) original.
CREATE OR REPLACE FUNCTION public.sp_Catalog_CreateLocation(
    p_ChainId int, p_Name varchar(200), p_Address varchar(400) DEFAULT NULL,
    p_Latitude numeric(9,6) DEFAULT NULL, p_Longitude numeric(9,6) DEFAULT NULL,
    p_OpenTime time DEFAULT NULL, p_CloseTime time DEFAULT NULL,
    p_BreakStartTime time DEFAULT NULL, p_BreakEndTime time DEFAULT NULL,
    p_WorkingDaysMask smallint DEFAULT NULL, p_TimeZoneId varchar(100) DEFAULT 'UTC',
    p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.Locations
        (ChainId, Name, Address, Latitude, Longitude, OpenTime, CloseTime, BreakStartTime, BreakEndTime, WorkingDaysMask, TimeZoneId, CreatedBy)
    VALUES
        (p_ChainId, p_Name, p_Address, p_Latitude, p_Longitude, p_OpenTime, p_CloseTime, p_BreakStartTime, p_BreakEndTime, p_WorkingDaysMask, p_TimeZoneId, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateLocation(
    p_Id int, p_Name varchar(200), p_Address varchar(400) DEFAULT NULL,
    p_Latitude numeric(9,6) DEFAULT NULL, p_Longitude numeric(9,6) DEFAULT NULL,
    p_OpenTime time DEFAULT NULL, p_CloseTime time DEFAULT NULL,
    p_BreakStartTime time DEFAULT NULL, p_BreakEndTime time DEFAULT NULL,
    p_WorkingDaysMask smallint DEFAULT NULL, p_TimeZoneId varchar(100) DEFAULT NULL,
    p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    -- Deactivating closes the whole location outright -- block if any non-cancelled future booking
    -- still exists, same "don't retroactively invalidate a real appointment" guard used everywhere
    -- else hours/openings change.
    IF p_IsActive = FALSE AND EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE b.LocationId = p_Id AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND bt.StartTime >= now()
    ) THEN
        RAISE EXCEPTION 'Cannot deactivate this location -- it has existing bookings.' USING ERRCODE = '50034';
    END IF;

    -- Shrinking default hours or dropping a working day can orphan a future booking on any date
    -- that doesn't have its own LocationDaySchedule override still covering it -- a per-date
    -- override always wins over these base defaults, so a booking covered by one is unaffected.
    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE b.LocationId = p_Id AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND bt.StartTime >= now()
            AND NOT EXISTS (
                SELECT 1 FROM public.LocationDaySchedule ds
                WHERE ds.LocationId = p_Id
                    AND ds.DayBit = public.fn_DayBit((bt.StartTime AT TIME ZONE 'utc')::date)
                    AND ds.EffectiveFrom <= (bt.StartTime AT TIME ZONE 'utc')::date
                    AND (ds.EffectiveTo IS NULL OR ds.EffectiveTo >= (bt.StartTime AT TIME ZONE 'utc')::date)
                    AND ds.IsDelete = FALSE
            )
            AND (
                (p_WorkingDaysMask & public.fn_DayBit((bt.StartTime AT TIME ZONE 'utc')::date)) = 0
                OR (bt.StartTime AT TIME ZONE 'utc')::time < p_OpenTime
                OR (bt.EndTime AT TIME ZONE 'utc')::time > p_CloseTime
            )
    ) THEN
        RAISE EXCEPTION 'Cannot change these hours -- a booking already exists outside the new hours (or on a day being closed).' USING ERRCODE = '50035';
    END IF;

    UPDATE public.Locations
    SET Name = p_Name, Address = p_Address, Latitude = p_Latitude, Longitude = p_Longitude,
        OpenTime = p_OpenTime, CloseTime = p_CloseTime,
        BreakStartTime = p_BreakStartTime, BreakEndTime = p_BreakEndTime,
        WorkingDaysMask = p_WorkingDaysMask, TimeZoneId = p_TimeZoneId, IsActive = p_IsActive,
        UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Location not found.' USING ERRCODE = '50022';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_DeleteLocation(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Locations
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Location not found.' USING ERRCODE = '50022';
    END IF;
END;
$$;

-- Full scheduled-entry history for a location, newest EffectiveFrom first -- the caller groups by
-- DayBit and treats the first (latest EffectiveFrom <= today) row per day as "current".
CREATE OR REPLACE FUNCTION public.sp_Catalog_GetLocationDaySchedule(p_LocationId int)
RETURNS TABLE(Id int, DayBit smallint, OpenTime time, CloseTime time, IsClosed boolean, EffectiveFrom date, EffectiveTo date)
LANGUAGE sql STABLE AS $$
    SELECT Id, DayBit, OpenTime, CloseTime, IsClosed, EffectiveFrom, EffectiveTo
    FROM public.LocationDaySchedule
    WHERE LocationId = p_LocationId AND IsDelete = FALSE
    ORDER BY DayBit, EffectiveFrom DESC;
$$;

-- Schedules a day's hours (or a closed override) for a single date, a bounded date range, or
-- open-ended -- never edits an existing row in place, so a day's hours on any past date stay
-- reconstructable.
CREATE OR REPLACE FUNCTION public.sp_Catalog_AddLocationDaySchedule(
    p_LocationId int, p_DayBit smallint, p_EffectiveFrom date, p_CreatedBy int,
    p_OpenTime time DEFAULT NULL, p_CloseTime time DEFAULT NULL, p_IsClosed boolean DEFAULT FALSE,
    p_EffectiveTo date DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    IF p_IsClosed = FALSE AND (p_OpenTime IS NULL OR p_CloseTime IS NULL) THEN
        RAISE EXCEPTION 'Open and close time are required unless the day is marked closed.' USING ERRCODE = '50072';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.LocationDaySchedule
        WHERE LocationId = p_LocationId AND DayBit = p_DayBit AND EffectiveFrom = p_EffectiveFrom AND IsDelete = FALSE
    ) THEN
        RAISE EXCEPTION 'Hours are already scheduled for this day and date.' USING ERRCODE = '50069';
    END IF;

    -- A booking already exists on this day-of-week, on or after this row's effective window, that
    -- would fall outside the new hours (or on a day being closed entirely) -- block it.
    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE b.LocationId = p_LocationId AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL
            AND (bt.StartTime AT TIME ZONE 'utc')::date >= p_EffectiveFrom
            AND (p_EffectiveTo IS NULL OR (bt.StartTime AT TIME ZONE 'utc')::date <= p_EffectiveTo)
            AND public.fn_DayBit((bt.StartTime AT TIME ZONE 'utc')::date) = p_DayBit
            AND (p_IsClosed = TRUE OR (bt.StartTime AT TIME ZONE 'utc')::time < p_OpenTime OR (bt.EndTime AT TIME ZONE 'utc')::time > p_CloseTime)
    ) THEN
        RAISE EXCEPTION 'Cannot schedule these hours -- a booking already exists outside the new hours (or on a day being closed).' USING ERRCODE = '50073';
    END IF;

    INSERT INTO public.LocationDaySchedule (LocationId, DayBit, OpenTime, CloseTime, IsClosed, EffectiveFrom, EffectiveTo, CreatedBy)
    VALUES (p_LocationId, p_DayBit, p_OpenTime, p_CloseTime, p_IsClosed, p_EffectiveFrom, p_EffectiveTo, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

-- Corrects a not-yet-effective scheduled entry in place -- a day's current/past hours are never
-- editable this way, only future-dated ones still pending.
CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateLocationDaySchedule(
    p_Id int, p_EffectiveFrom date, p_UpdatedBy int,
    p_OpenTime time DEFAULT NULL, p_CloseTime time DEFAULT NULL, p_IsClosed boolean DEFAULT FALSE,
    p_EffectiveTo date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_LocationId int;
    v_DayBit smallint;
BEGIN
    IF p_IsClosed = FALSE AND (p_OpenTime IS NULL OR p_CloseTime IS NULL) THEN
        RAISE EXCEPTION 'Open and close time are required unless the day is marked closed.' USING ERRCODE = '50072';
    END IF;

    SELECT LocationId, DayBit INTO v_LocationId, v_DayBit
    FROM public.LocationDaySchedule
    WHERE Id = p_Id AND IsDelete = FALSE;

    IF v_LocationId IS NULL THEN
        RAISE EXCEPTION 'Scheduled hours not found.' USING ERRCODE = '50071';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.LocationDaySchedule
        WHERE Id = p_Id AND EffectiveFrom <= public.fn_UtcToday()
    ) THEN
        RAISE EXCEPTION 'Cannot edit hours that are already in effect.' USING ERRCODE = '50070';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.LocationDaySchedule
        WHERE LocationId = v_LocationId AND DayBit = v_DayBit AND EffectiveFrom = p_EffectiveFrom AND IsDelete = FALSE AND Id <> p_Id
    ) THEN
        RAISE EXCEPTION 'Hours are already scheduled for this day and date.' USING ERRCODE = '50069';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE b.LocationId = v_LocationId AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL
            AND (bt.StartTime AT TIME ZONE 'utc')::date >= p_EffectiveFrom
            AND (p_EffectiveTo IS NULL OR (bt.StartTime AT TIME ZONE 'utc')::date <= p_EffectiveTo)
            AND public.fn_DayBit((bt.StartTime AT TIME ZONE 'utc')::date) = v_DayBit
            AND (p_IsClosed = TRUE OR (bt.StartTime AT TIME ZONE 'utc')::time < p_OpenTime OR (bt.EndTime AT TIME ZONE 'utc')::time > p_CloseTime)
    ) THEN
        RAISE EXCEPTION 'Cannot change these hours -- a booking already exists outside the new hours (or on a day being closed).' USING ERRCODE = '50073';
    END IF;

    UPDATE public.LocationDaySchedule
    SET OpenTime = p_OpenTime, CloseTime = p_CloseTime, IsClosed = p_IsClosed,
        EffectiveFrom = p_EffectiveFrom, EffectiveTo = p_EffectiveTo,
        UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id;
END;
$$;

-- Cancels a not-yet-effective scheduled entry -- refuses once its EffectiveFrom has already passed.
CREATE OR REPLACE FUNCTION public.sp_Catalog_DeleteLocationDaySchedule(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.LocationDaySchedule
        WHERE Id = p_Id AND IsDelete = FALSE AND EffectiveFrom <= public.fn_UtcToday()
    ) THEN
        RAISE EXCEPTION 'Cannot cancel hours that are already in effect.' USING ERRCODE = '50070';
    END IF;

    UPDATE public.LocationDaySchedule
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Scheduled hours not found.' USING ERRCODE = '50071';
    END IF;
END;
$$;

-- Lists closures (holidays/maintenance days) for admin management -- either one location or every
-- location under a chain.
CREATE OR REPLACE FUNCTION public.sp_Admin_GetLocationClosures(p_LocationId int DEFAULT NULL, p_ChainId int DEFAULT NULL, p_Id int DEFAULT NULL)
RETURNS TABLE(Id int, LocationId int, LocationName varchar, ChainId int, HolidayDate date, Reason varchar, Type varchar)
LANGUAGE sql STABLE AS $$
    SELECT h.Id, h.LocationId, l.Name AS LocationName, l.ChainId, h.HolidayDate, h.Reason, h.Type
    FROM public.LocationHolidays h
        JOIN public.Locations l ON l.Id = h.LocationId
    WHERE h.IsDelete = FALSE AND h.IsActive = TRUE
        AND (p_LocationId IS NULL OR h.LocationId = p_LocationId)
        AND (p_ChainId IS NULL OR l.ChainId = p_ChainId)
        AND (p_Id IS NULL OR h.Id = p_Id)
    ORDER BY h.HolidayDate DESC, l.Name;
$$;

-- Closes one or more locations over an inclusive date range in one atomic call. Rejects the whole
-- request if ANY date in the range already has a non-cancelled booking at ANY of the target
-- locations. Dates already closed are silently skipped, not duplicated.
CREATE OR REPLACE FUNCTION public.sp_Admin_CreateLocationClosures(
    p_LocationIds int[], p_FromDate date, p_ToDate date, p_Type varchar(20),
    p_Reason varchar(200) DEFAULT NULL, p_CreatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.Bookings b
            JOIN public.BookingTreatments bt ON bt.BookingId = b.Id AND bt.IsDelete = FALSE
            JOIN unnest(p_LocationIds) AS li(Id) ON li.Id = b.LocationId
        WHERE (bt.StartTime AT TIME ZONE 'utc')::date BETWEEN p_FromDate AND p_ToDate
            AND b.IsDelete = FALSE AND b.Status <> 'Cancelled'
    ) THEN
        RAISE EXCEPTION 'Cannot close -- one or more existing bookings fall within this date range.' USING ERRCODE = '50068';
    END IF;

    INSERT INTO public.LocationHolidays (LocationId, HolidayDate, Reason, Type, CreatedBy)
    SELECT li.Id, d.D, p_Reason, p_Type, p_CreatedBy
    FROM unnest(p_LocationIds) AS li(Id)
        CROSS JOIN (SELECT generate_series(p_FromDate, p_ToDate, interval '1 day')::date AS D) d
    WHERE NOT EXISTS (
        SELECT 1 FROM public.LocationHolidays h
        WHERE h.LocationId = li.Id AND h.HolidayDate = d.D AND h.IsDelete = FALSE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_DeleteLocationClosure(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.LocationHolidays
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Closure not found.' USING ERRCODE = '50022';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetTreatmentCategories(p_LocationId int)
RETURNS TABLE(Id int, LocationId int, Name varchar, IsActive boolean)
LANGUAGE sql STABLE AS $$
    SELECT Id, LocationId, Name, IsActive
    FROM public.TreatmentCategories
    WHERE LocationId = p_LocationId AND IsDelete = FALSE
    ORDER BY Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_CreateTreatmentCategory(p_LocationId int, p_Name varchar(200), p_CreatedBy int, OUT p_Id int)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.TreatmentCategories (LocationId, Name, CreatedBy)
    VALUES (p_LocationId, p_Name, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateTreatmentCategory(p_Id int, p_Name varchar(200), p_IsActive boolean, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.TreatmentCategories
    SET Name = p_Name, IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Treatment category not found.' USING ERRCODE = '50025';
    END IF;
END;
$$;

-- p_EffectiveFrom is the treatment's own go-live date, independent of price. p_Price seeds its
-- required first TreatmentPrices row, always effective from today.
CREATE OR REPLACE FUNCTION public.sp_Catalog_CreateTreatment(
    p_LocationId int, p_CategoryId int, p_Name varchar(200), p_Description varchar(2000) DEFAULT NULL,
    p_DurationSlots smallint DEFAULT NULL, p_PreTimeMinutes smallint DEFAULT 0,
    p_EffectiveFrom date DEFAULT NULL, p_Price numeric(10,2) DEFAULT NULL,
    p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.Treatments (LocationId, CategoryId, Name, Description, EffectiveFrom, CreatedBy)
    VALUES (p_LocationId, p_CategoryId, p_Name, p_Description, p_EffectiveFrom, p_CreatedBy)
    RETURNING Id INTO p_Id;

    INSERT INTO public.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy)
    VALUES (p_Id, p_Price, public.fn_UtcToday(), p_CreatedBy);

    INSERT INTO public.TreatmentDurations (TreatmentId, DurationSlots, PreTimeMinutes, EffectiveFrom, CreatedBy)
    VALUES (p_Id, p_DurationSlots, p_PreTimeMinutes, public.fn_UtcToday(), p_CreatedBy);
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateTreatment(
    p_Id int, p_CategoryId int, p_Name varchar(200), p_Description varchar(2000) DEFAULT NULL,
    p_EffectiveFrom date DEFAULT NULL, p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Treatments
    SET CategoryId = p_CategoryId, Name = p_Name, Description = p_Description, EffectiveFrom = p_EffectiveFrom,
        IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Treatment not found.' USING ERRCODE = '50023';
    END IF;
END;
$$;

-- Schedules a new price for a treatment, effective from a given date -- never overwrites an
-- existing TreatmentPrices row, so past-dated prices stay intact for historical bookings.
CREATE OR REPLACE FUNCTION public.sp_Catalog_AddTreatmentPrice(
    p_TreatmentId int, p_Price numeric(10,2), p_EffectiveFrom date, p_CreatedBy int,
    p_EffectiveTo date DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.Treatments WHERE Id = p_TreatmentId AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Treatment not found.' USING ERRCODE = '50023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.TreatmentPrices
        WHERE TreatmentId = p_TreatmentId AND EffectiveFrom = p_EffectiveFrom AND IsDelete = FALSE
    ) THEN
        RAISE EXCEPTION 'A price is already scheduled for this date.' USING ERRCODE = '50026';
    END IF;

    INSERT INTO public.TreatmentPrices (TreatmentId, Price, EffectiveFrom, EffectiveTo, CreatedBy)
    VALUES (p_TreatmentId, p_Price, p_EffectiveFrom, p_EffectiveTo, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

-- Corrects a price's amount in place -- only while no non-cancelled booking has captured this
-- exact price row.
CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateTreatmentPrice(p_Id int, p_Price numeric(10,2), p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.TreatmentPrices WHERE Id = p_Id AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Treatment not found.' USING ERRCODE = '50023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.TreatmentPriceId = p_Id AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
    ) THEN
        RAISE EXCEPTION 'Cannot edit this price -- it has already been used by a booking.' USING ERRCODE = '50027';
    END IF;

    UPDATE public.TreatmentPrices
    SET Price = p_Price, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetTreatmentPrices(p_TreatmentId int)
RETURNS TABLE(Id int, Price numeric, EffectiveFrom date, EffectiveTo date)
LANGUAGE sql STABLE AS $$
    SELECT Id, Price, EffectiveFrom, EffectiveTo
    FROM public.TreatmentPrices
    WHERE TreatmentId = p_TreatmentId AND IsDelete = FALSE
    ORDER BY EffectiveFrom DESC;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_AddTreatmentDuration(
    p_TreatmentId int, p_DurationSlots smallint, p_EffectiveFrom date, p_CreatedBy int,
    p_PreTimeMinutes smallint DEFAULT 0, p_EffectiveTo date DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.Treatments WHERE Id = p_TreatmentId AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Treatment not found.' USING ERRCODE = '50023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.TreatmentDurations
        WHERE TreatmentId = p_TreatmentId AND EffectiveFrom = p_EffectiveFrom AND IsDelete = FALSE
    ) THEN
        RAISE EXCEPTION 'A duration is already scheduled for this date.' USING ERRCODE = '50026';
    END IF;

    -- A booking's SlotCount/StartTime/EndTime are captured once at creation and never re-derived
    -- from the treatment's current duration, so this new row can't retroactively resize an
    -- already-booked appointment -- it would misrepresent what governed it going forward though,
    -- so block scheduling it while such a booking still stands.
    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.TreatmentId = p_TreatmentId AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date >= p_EffectiveFrom
    ) THEN
        RAISE EXCEPTION 'Cannot schedule this duration change -- a booking already exists on or after that date.' USING ERRCODE = '50028';
    END IF;

    INSERT INTO public.TreatmentDurations (TreatmentId, DurationSlots, PreTimeMinutes, EffectiveFrom, EffectiveTo, CreatedBy)
    VALUES (p_TreatmentId, p_DurationSlots, p_PreTimeMinutes, p_EffectiveFrom, p_EffectiveTo, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateTreatmentDuration(
    p_Id int, p_DurationSlots smallint, p_PreTimeMinutes smallint DEFAULT 0, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.TreatmentDurations WHERE Id = p_Id AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Treatment duration not found.' USING ERRCODE = '50023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.TreatmentDurationId = p_Id AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
    ) THEN
        RAISE EXCEPTION 'Cannot edit this duration -- it has already been used by a booking.' USING ERRCODE = '50027';
    END IF;

    UPDATE public.TreatmentDurations
    SET DurationSlots = p_DurationSlots, PreTimeMinutes = p_PreTimeMinutes, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetTreatmentDurations(p_TreatmentId int)
RETURNS TABLE(Id int, DurationSlots smallint, PreTimeMinutes smallint, EffectiveFrom date, EffectiveTo date)
LANGUAGE sql STABLE AS $$
    SELECT Id, DurationSlots, PreTimeMinutes, EffectiveFrom, EffectiveTo
    FROM public.TreatmentDurations
    WHERE TreatmentId = p_TreatmentId AND IsDelete = FALSE
    ORDER BY EffectiveFrom DESC;
$$;

-- Only a not-yet-effective row can be removed -- past and currently-effective durations stay,
-- since they already governed (or are governing) real appointments.
CREATE OR REPLACE FUNCTION public.sp_Catalog_DeleteTreatmentDuration(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_TreatmentId int;
    v_EffectiveFrom date;
BEGIN
    SELECT TreatmentId, EffectiveFrom INTO v_TreatmentId, v_EffectiveFrom
    FROM public.TreatmentDurations WHERE Id = p_Id AND IsDelete = FALSE;

    IF v_TreatmentId IS NULL THEN
        RAISE EXCEPTION 'Treatment duration not found.' USING ERRCODE = '50023';
    END IF;

    IF v_EffectiveFrom <= public.fn_UtcToday() THEN
        RAISE EXCEPTION 'Cannot delete a duration that is already in effect.' USING ERRCODE = '50030';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.TreatmentId = v_TreatmentId AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date >= v_EffectiveFrom
    ) THEN
        RAISE EXCEPTION 'Cannot delete this duration -- a booking already exists on or after that date.' USING ERRCODE = '50029';
    END IF;

    UPDATE public.TreatmentDurations
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Therapists / Rooms
-------------------------------------------------------------------------------------------------

-- p_LocationId matches TherapistProfile.LocationId directly. p_ChainId matches either
-- TherapistProfile.ChainId OR (via the linked Location) l.ChainId. A therapist with NEITHER set
-- always matches -- unassigned rows are a shared pool visible to any caller until claimed.
CREATE OR REPLACE FUNCTION public.sp_Catalog_GetTherapists(p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, Name varchar, IsActive boolean, ChainId int, LocationId int)
LANGUAGE sql STABLE AS $$
    SELECT tp.Id, tp.Name, tp.IsActive, tp.ChainId, tp.LocationId
    FROM public.TherapistProfile tp
        LEFT JOIN public.Locations l ON l.Id = tp.LocationId
    WHERE tp.IsDelete = FALSE
        AND (p_LocationId IS NULL OR tp.LocationId = p_LocationId OR tp.LocationId IS NULL)
        AND (p_ChainId IS NULL OR tp.ChainId = p_ChainId OR l.ChainId = p_ChainId OR (tp.ChainId IS NULL AND tp.LocationId IS NULL))
    ORDER BY tp.Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_CreateTherapist(p_Name varchar(200), p_CreatedBy int, OUT p_Id int)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.TherapistProfile (Name, CreatedBy)
    VALUES (p_Name, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateTherapist(p_Id int, p_Name varchar(200), p_IsActive boolean, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.TherapistProfile
    SET Name = p_Name, IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Therapist not found.' USING ERRCODE = '50024';
    END IF;
END;
$$;

-- Keeps a TherapistProfile's scope mirrored to whichever Users row currently links to it --
-- separate from sp_Catalog_UpdateTherapist so the plain Therapists-page edit form can never blank
-- these out by omission.
CREATE OR REPLACE FUNCTION public.sp_Catalog_LinkTherapistScope(
    p_Id int, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL, p_UserId int DEFAULT NULL, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.TherapistProfile
    SET ChainId = p_ChainId, LocationId = p_LocationId, UserId = p_UserId,
        UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_GetRooms(p_LocationId int)
RETURNS TABLE(Id int, LocationId int, Name varchar, IsActive boolean)
LANGUAGE sql STABLE AS $$
    SELECT Id, LocationId, Name, IsActive
    FROM public.Rooms
    WHERE LocationId = p_LocationId AND IsDelete = FALSE
    ORDER BY Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_CreateRoom(p_LocationId int, p_Name varchar(100), p_CreatedBy int, OUT p_Id int)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.Rooms (LocationId, Name, CreatedBy)
    VALUES (p_LocationId, p_Name, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateRoom(p_Id int, p_Name varchar(100), p_IsActive boolean, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Rooms
    SET Name = p_Name, IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Room not found.' USING ERRCODE = '50025';
    END IF;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Bookings oversight
-------------------------------------------------------------------------------------------------

-- "For a location on a date" means "has at least one treatment line scheduled that day" --
-- schedule lives per-treatment (BookingTreatments), not on the booking itself.
CREATE OR REPLACE FUNCTION public.fn_Booking_ForLocationHeaders(p_LocationId int, p_WorkDate date)
RETURNS TABLE(BookingId int, LocationId int, LocationName varchar, CustomerId int, CustomerName varchar, CustomerEmail varchar, CustomerPhone varchar,
              Status varchar, CreatedDate timestamptz,
              AppointmentStatusId int, AppointmentStatusName varchar, AppointmentStatusColorHex varchar,
              CancelReasonId int, CancelReasonName varchar, PaymentStatus varchar, PaymentProvider varchar)
LANGUAGE sql STABLE AS $$
    SELECT b.Id AS BookingId, b.LocationId, l.Name AS LocationName, b.CustomerId, c.Name AS CustomerName, c.Email AS CustomerEmail, c.Phone AS CustomerPhone,
        b.Status, b.CreatedDate,
        b.AppointmentStatusId, aps.Name AS AppointmentStatusName, aps.ColorHex AS AppointmentStatusColorHex,
        b.CancelReasonId, cr.Name AS CancelReasonName,
        p.Status AS PaymentStatus, p.Provider AS PaymentProvider
    FROM public.Bookings b
        JOIN public.Locations l ON l.Id = b.LocationId
        JOIN public.Users c ON c.Id = b.CustomerId
        LEFT JOIN public.AppointmentStatuses aps ON aps.Id = b.AppointmentStatusId
        LEFT JOIN public.CancelReasons cr ON cr.Id = b.CancelReasonId
        LEFT JOIN LATERAL (
            SELECT pay.Provider, pay.Status
            FROM public.Payments pay
            WHERE pay.BookingId = b.Id
            ORDER BY pay.Id DESC
            LIMIT 1
        ) p ON TRUE
    WHERE b.LocationId = p_LocationId AND b.IsDelete = FALSE
        AND b.Status <> 'Cancelled'
        AND EXISTS (
            SELECT 1
            FROM public.BookingTreatments bt
            WHERE bt.BookingId = b.Id AND bt.IsDelete = FALSE AND (bt.StartTime AT TIME ZONE 'utc')::date = p_WorkDate
        )
    ORDER BY b.Id;
$$;

CREATE OR REPLACE FUNCTION public.fn_Booking_ForLocationTreatments(p_LocationId int, p_WorkDate date)
RETURNS TABLE(BookingId int, BookingTreatmentId int, TreatmentId int, TreatmentName varchar, DurationSlots smallint, PreTimeMinutes smallint, Price numeric,
              StartTime timestamptz, EndTime timestamptz, RoomId int, RoomName varchar, TherapistId int, TherapistName varchar, ExpiresAt timestamptz)
LANGUAGE sql STABLE AS $$
    -- COALESCE against bt.SlotCount, see fn_Booking_ConfirmationTreatments for why.
    SELECT bt.BookingId, bt.Id AS BookingTreatmentId, bt.TreatmentId, t.Name AS TreatmentName,
        COALESCE(td.DurationSlots, bt.SlotCount) AS DurationSlots, COALESCE(td.PreTimeMinutes, 0) AS PreTimeMinutes, bt.Price,
        bt.StartTime, bt.EndTime, bt.RoomId, r.Name AS RoomName, bt.TherapistId, th.Name AS TherapistName, bt.ExpiresAt
    FROM public.BookingTreatments bt
        JOIN public.Treatments t ON t.Id = bt.TreatmentId
        JOIN public.Bookings b ON b.Id = bt.BookingId
        LEFT JOIN public.TreatmentDurations td ON td.Id = bt.TreatmentDurationId
        LEFT JOIN public.Rooms r ON r.Id = bt.RoomId
        LEFT JOIN public.TherapistProfile th ON th.Id = bt.TherapistId
    WHERE b.LocationId = p_LocationId AND b.IsDelete = FALSE AND bt.IsDelete = FALSE
        AND b.Status <> 'Cancelled'
        AND (bt.StartTime AT TIME ZONE 'utc')::date = p_WorkDate
    ORDER BY bt.StartTime;
$$;

-- Pre-check for POST /api/admin/bookings/{id}/cancel -- Manager is location-scoped and must be
-- rejected before sp_Booking_CancelAsAdmin runs (that function has no caller-scoping of its own).
CREATE OR REPLACE FUNCTION public.sp_Booking_GetLocationId(p_BookingId int)
RETURNS TABLE(LocationId int)
LANGUAGE sql STABLE AS $$
    SELECT LocationId FROM public.Bookings WHERE Id = p_BookingId AND IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_GetCustomerId(p_BookingId int)
RETURNS TABLE(CustomerId int)
LANGUAGE sql STABLE AS $$
    SELECT CustomerId FROM public.Bookings WHERE Id = p_BookingId AND IsDelete = FALSE;
$$;

-- Admin override: unlike sp_Booking_Cancel, does not require the caller to own the booking.
CREATE OR REPLACE FUNCTION public.sp_Booking_CancelAsAdmin(p_BookingId int, p_UpdatedBy int, p_CancelReasonId int DEFAULT NULL)
RETURNS TABLE(LocationId int, RoomId int, WorkDate date)
LANGUAGE plpgsql AS $$
DECLARE
    v_PriorStatus varchar(10);
    v_RowCount int;
BEGIN
    SELECT Status INTO v_PriorStatus FROM public.Bookings WHERE Id = p_BookingId AND IsDelete = FALSE;

    UPDATE public.Bookings
    SET Status = 'Cancelled', CancelReasonId = p_CancelReasonId, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_BookingId AND IsDelete = FALSE AND Status IN ('Draft', 'Confirmed');

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Booking not found.' USING ERRCODE = '50004';
    END IF;

    IF v_PriorStatus = 'Confirmed' THEN
        UPDATE public.Products p
        SET QuantityOnHand = p.QuantityOnHand + bp.Quantity, UpdatedDate = now()
        FROM public.BookingProducts bp
        WHERE bp.ProductId = p.Id AND bp.BookingId = p_BookingId AND bp.IsDelete = FALSE;
    END IF;

    RETURN QUERY
    SELECT b.LocationId, bt.RoomId, (bt.StartTime AT TIME ZONE 'utc')::date AS WorkDate
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = p_BookingId AND bt.IsDelete = FALSE AND bt.StartTime IS NOT NULL;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Staff-as-customer emulation / customer CRM
-------------------------------------------------------------------------------------------------

-- Powers the admin-portal "Customers" picker used to start an emulation session -- active
-- customers only, top 20, always requires p_Search. Two code paths (not one query with a runtime
-- CASE) for the same reason the T-SQL original split them: an unscoped RootSuperAdmin search has
-- no business touching CustomerLocations/Locations at all.
CREATE OR REPLACE FUNCTION public.sp_Admin_SearchCustomers(p_Search varchar(200), p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, Name varchar, Email varchar, Phone varchar, CanEmulate boolean, IsWalkIn boolean)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_ChainId IS NULL AND p_LocationId IS NULL THEN
        RETURN QUERY
        SELECT u.Id, u.Name, u.Email, u.Phone, TRUE AS CanEmulate, u.IsWalkIn
        FROM public.Users u
        WHERE u.Role = 'Customer' AND u.IsDelete = FALSE AND u.IsActive = TRUE
            AND (u.Name ILIKE '%' || p_Search || '%' OR u.Email ILIKE '%' || p_Search || '%')
        ORDER BY u.Name
        LIMIT 20;
    ELSE
        RETURN QUERY
        SELECT u.Id, u.Name, u.Email, u.Phone,
            (cl.CustomerId IS NOT NULL) AS CanEmulate,
            u.IsWalkIn
        FROM public.Users u
            LEFT JOIN (
                SELECT DISTINCT c.CustomerId
                FROM public.CustomerLocations c
                    JOIN public.Locations l ON l.Id = c.LocationId
                WHERE c.IsDelete = FALSE
                    AND (p_ChainId IS NULL OR l.ChainId = p_ChainId)
                    AND (p_LocationId IS NULL OR c.LocationId = p_LocationId)
            ) cl ON cl.CustomerId = u.Id
        WHERE u.Role = 'Customer' AND u.IsDelete = FALSE AND u.IsActive = TRUE
            AND (u.Name ILIKE '%' || p_Search || '%' OR u.Email ILIKE '%' || p_Search || '%')
        ORDER BY u.Name
        LIMIT 20;
    END IF;
END;
$$;

-- Keyset (cursor) pagination, not OFFSET/FETCH -- p_CursorName/p_CursorId are the last row's own
-- Name/Id from the previous page, so the WHERE clause seeks straight to where the next page
-- starts instead of re-scanning and discarding N rows every time the caller scrolls further.
CREATE OR REPLACE FUNCTION public.sp_Admin_GetCustomers(
    p_Search varchar(200) DEFAULT NULL, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_PageSize int DEFAULT 50, p_CursorName varchar(200) DEFAULT NULL, p_CursorId int DEFAULT NULL
)
RETURNS TABLE(Id int, Name varchar, Email varchar, Phone varchar, IsActive boolean, CreatedDate timestamptz,
              CanEmulate boolean, IsWalkIn boolean)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_ChainId IS NULL AND p_LocationId IS NULL THEN
        RETURN QUERY
        SELECT u.Id, u.Name, u.Email, u.Phone, u.IsActive, u.CreatedDate,
            TRUE AS CanEmulate, u.IsWalkIn
        FROM public.Users u
        WHERE u.Role = 'Customer' AND u.IsDelete = FALSE
            AND (p_Search IS NULL OR u.Name ILIKE '%' || p_Search || '%' OR u.Email ILIKE '%' || p_Search || '%')
            AND (p_CursorName IS NULL OR u.Name > p_CursorName OR (u.Name = p_CursorName AND u.Id > p_CursorId))
        ORDER BY u.Name, u.Id
        LIMIT p_PageSize;
    ELSE
        RETURN QUERY
        SELECT u.Id, u.Name, u.Email, u.Phone, u.IsActive, u.CreatedDate,
            (cl.CustomerId IS NOT NULL) AS CanEmulate,
            u.IsWalkIn
        FROM public.Users u
            LEFT JOIN (
                SELECT DISTINCT c.CustomerId
                FROM public.CustomerLocations c
                    JOIN public.Locations l ON l.Id = c.LocationId
                WHERE c.IsDelete = FALSE
                    AND (p_ChainId IS NULL OR l.ChainId = p_ChainId)
                    AND (p_LocationId IS NULL OR c.LocationId = p_LocationId)
            ) cl ON cl.CustomerId = u.Id
        WHERE u.Role = 'Customer' AND u.IsDelete = FALSE
            AND (p_Search IS NULL OR u.Name ILIKE '%' || p_Search || '%' OR u.Email ILIKE '%' || p_Search || '%')
            AND (p_CursorName IS NULL OR u.Name > p_CursorName OR (u.Name = p_CursorName AND u.Id > p_CursorId))
        ORDER BY u.Name, u.Id
        LIMIT p_PageSize;
    END IF;
END;
$$;

-- Customer counterpart to sp_Admin_UpdateUser -- deliberately narrow, restricted to Role =
-- 'Customer' so this can never be pointed at a staff row by id.
CREATE OR REPLACE FUNCTION public.sp_Admin_UpdateCustomer(p_Id int, p_Name varchar(200), p_Phone varchar(30) DEFAULT NULL, p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Users
    SET Name = p_Name, Phone = p_Phone, IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE AND Role = 'Customer';

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Customer not found.' USING ERRCODE = '50042';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_DeleteCustomer(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Users
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE AND Role = 'Customer';

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Customer not found.' USING ERRCODE = '50043';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_GetCustomerProfile(p_CustomerId int)
RETURNS TABLE(Id int, Name varchar, Email varchar, Phone varchar, IsActive boolean, CreatedDate timestamptz, IsWalkIn boolean)
LANGUAGE sql STABLE AS $$
    SELECT u.Id, u.Name, u.Email, u.Phone, u.IsActive, u.CreatedDate, u.IsWalkIn
    FROM public.Users u
    WHERE u.Id = p_CustomerId AND u.IsDelete = FALSE AND u.Role = 'Customer';
$$;

-- Idempotent upsert -- called from sp_Booking_Confirm (a real visit) and sp_CustomerNote_Create/
-- sp_CustomerTag_Add when they're location-scoped. Never called for a saloon-wide (ChainId-scoped)
-- note/tag -- there's no single location to bind in that case.
CREATE OR REPLACE FUNCTION public.sp_CustomerLocation_Bind(p_CustomerId int, p_LocationId int, p_CreatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.CustomerLocations WHERE CustomerId = p_CustomerId AND LocationId = p_LocationId AND IsDelete = FALSE) THEN
        INSERT INTO public.CustomerLocations (CustomerId, LocationId, CreatedBy) VALUES (p_CustomerId, p_LocationId, p_CreatedBy);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_CustomerNote_Create(
    p_CustomerId int, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_Note text DEFAULT NULL, p_CreatedBy int DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_Id int;
BEGIN
    IF (CASE WHEN p_ChainId IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN p_LocationId IS NOT NULL THEN 1 ELSE 0 END) <> 1 THEN
        RAISE EXCEPTION 'A note must have exactly one of ChainId or LocationId.' USING ERRCODE = '50048';
    END IF;

    IF p_LocationId IS NOT NULL THEN
        PERFORM public.sp_CustomerLocation_Bind(p_CustomerId, p_LocationId, p_CreatedBy);
    END IF;

    INSERT INTO public.CustomerNotes (CustomerId, ChainId, LocationId, Note, CreatedBy)
    VALUES (p_CustomerId, p_ChainId, p_LocationId, p_Note, p_CreatedBy)
    RETURNING Id INTO v_Id;

    RETURN v_Id;
END;
$$;

-- p_ChainId/p_LocationId read filters additionally resolve a caller's p_LocationId to its chain
-- so a saloon-wide note is still visible at every one of that chain's locations, not just to
-- chain-scoped callers.
CREATE OR REPLACE FUNCTION public.sp_CustomerNote_GetForCustomer(p_CustomerId int, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, Note text, ChainId int, ChainName varchar, LocationId int, LocationName varchar,
              CreatedDate timestamptz, CreatedByName varchar)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_ResolvedChainId int := p_ChainId;
BEGIN
    IF p_LocationId IS NOT NULL AND v_ResolvedChainId IS NULL THEN
        SELECT l.ChainId INTO v_ResolvedChainId FROM public.Locations l WHERE l.Id = p_LocationId;
    END IF;

    RETURN QUERY
    SELECT n.Id, n.Note, n.ChainId, sc.Name AS ChainName, n.LocationId, l.Name AS LocationName,
        n.CreatedDate, creator.Name AS CreatedByName
    FROM public.CustomerNotes n
        LEFT JOIN public.Locations l ON l.Id = n.LocationId
        LEFT JOIN public.SaloonChains sc ON sc.Id = COALESCE(n.ChainId, l.ChainId)
        LEFT JOIN public.Users creator ON creator.Id = n.CreatedBy
    WHERE n.CustomerId = p_CustomerId AND n.IsDelete = FALSE
        AND (
            v_ResolvedChainId IS NULL -- RootSuperAdmin: unrestricted
            OR n.ChainId = v_ResolvedChainId -- saloon-wide note in caller's chain
            OR (l.ChainId = v_ResolvedChainId AND (p_LocationId IS NULL OR n.LocationId = p_LocationId))
        )
    ORDER BY n.CreatedDate DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_CustomerNote_Delete(p_Id int, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.CustomerNotes
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Note not found.' USING ERRCODE = '50045';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_CustomerTag_Add(
    p_CustomerId int, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_Tag varchar(100) DEFAULT NULL, p_CreatedBy int DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_Id int;
BEGIN
    IF (CASE WHEN p_ChainId IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN p_LocationId IS NOT NULL THEN 1 ELSE 0 END) <> 1 THEN
        RAISE EXCEPTION 'A tag must have exactly one of ChainId or LocationId.' USING ERRCODE = '50048';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.CustomerTags
        WHERE CustomerId = p_CustomerId AND Tag = p_Tag AND IsDelete = FALSE
            AND ((p_ChainId IS NOT NULL AND ChainId = p_ChainId) OR (p_LocationId IS NOT NULL AND LocationId = p_LocationId))
    ) THEN
        RAISE EXCEPTION 'That tag already exists for this customer at this scope.' USING ERRCODE = '50046';
    END IF;

    IF p_LocationId IS NOT NULL THEN
        PERFORM public.sp_CustomerLocation_Bind(p_CustomerId, p_LocationId, p_CreatedBy);
    END IF;

    INSERT INTO public.CustomerTags (CustomerId, ChainId, LocationId, Tag, CreatedBy)
    VALUES (p_CustomerId, p_ChainId, p_LocationId, p_Tag, p_CreatedBy)
    RETURNING Id INTO v_Id;

    RETURN v_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_CustomerTag_GetForCustomer(p_CustomerId int, p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, Tag varchar, ChainId int, ChainName varchar, LocationId int, LocationName varchar)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_ResolvedChainId int := p_ChainId;
BEGIN
    IF p_LocationId IS NOT NULL AND v_ResolvedChainId IS NULL THEN
        SELECT l.ChainId INTO v_ResolvedChainId FROM public.Locations l WHERE l.Id = p_LocationId;
    END IF;

    RETURN QUERY
    SELECT t.Id, t.Tag, t.ChainId, sc.Name AS ChainName, t.LocationId, l.Name AS LocationName
    FROM public.CustomerTags t
        LEFT JOIN public.Locations l ON l.Id = t.LocationId
        LEFT JOIN public.SaloonChains sc ON sc.Id = COALESCE(t.ChainId, l.ChainId)
    WHERE t.CustomerId = p_CustomerId AND t.IsDelete = FALSE
        AND (
            v_ResolvedChainId IS NULL
            OR t.ChainId = v_ResolvedChainId
            OR (l.ChainId = v_ResolvedChainId AND (p_LocationId IS NULL OR t.LocationId = p_LocationId))
        )
    ORDER BY t.Tag;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_CustomerTag_Delete(p_Id int, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.CustomerTags
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Tag not found.' USING ERRCODE = '50047';
    END IF;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Staff scheduling: therapist shift assignments + room-category openings
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_Scheduling_RosterShifts(p_LocationId int, p_WorkDate date)
RETURNS TABLE(Id int, TherapistId int, TherapistName varchar, RoomId int, ShiftType varchar, StartTime time, EndTime time)
LANGUAGE sql STABLE AS $$
    SELECT sa.Id, sa.TherapistId, th.Name AS TherapistName, sa.RoomId, sa.ShiftType, sa.StartTime, sa.EndTime
    FROM public.ShiftAssignments sa
        JOIN public.TherapistProfile th ON th.Id = sa.TherapistId
    WHERE sa.LocationId = p_LocationId AND sa.WorkDate = p_WorkDate AND sa.IsDelete = FALSE
    ORDER BY sa.ShiftType, th.Name;
$$;

CREATE OR REPLACE FUNCTION public.fn_Scheduling_RosterRoomOpenings(p_LocationId int, p_WorkDate date)
RETURNS TABLE(Id int, RoomId int, RoomName varchar, TreatmentCategoryId int, CategoryName varchar, ShiftType varchar)
LANGUAGE sql STABLE AS $$
    SELECT rca.Id, rca.RoomId, r.Name AS RoomName, rca.TreatmentCategoryId, tc.Name AS CategoryName, rca.ShiftType
    FROM public.RoomCategoryAssignments rca
        JOIN public.Rooms r ON r.Id = rca.RoomId
        JOIN public.TreatmentCategories tc ON tc.Id = rca.TreatmentCategoryId
    WHERE r.LocationId = p_LocationId AND rca.WorkDate = p_WorkDate AND rca.IsDelete = FALSE
    ORDER BY rca.ShiftType, r.Name;
$$;

CREATE OR REPLACE FUNCTION public.fn_Scheduling_RosterBlocks(p_LocationId int, p_WorkDate date)
RETURNS TABLE(Id int, RoomId int, RoomName varchar, StartTime time, EndTime time, Reason varchar, IsLocationBreak boolean, BlockTypeId int)
LANGUAGE sql STABLE AS $$
    SELECT bs.Id, bs.RoomId, r.Name AS RoomName, bs.StartTime, bs.EndTime, bs.Reason, FALSE AS IsLocationBreak, bs.BlockTypeId
    FROM public.BlockedSlots bs
        JOIN public.Rooms r ON r.Id = bs.RoomId
    WHERE r.LocationId = p_LocationId AND bs.WorkDate = p_WorkDate AND bs.IsDelete = FALSE

    UNION ALL

    SELECT
        0 AS Id,
        r.Id AS RoomId,
        r.Name AS RoomName,
        COALESCE(l.BreakStartTime, c.BreakStartTime) AS StartTime,
        COALESCE(l.BreakEndTime, c.BreakEndTime) AS EndTime,
        'Lunch Break' AS Reason,
        TRUE AS IsLocationBreak,
        NULL::int AS BlockTypeId
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
        CROSS JOIN public.Rooms r
    WHERE l.Id = p_LocationId
        AND r.LocationId = l.Id
        AND r.IsDelete = FALSE AND r.IsActive = TRUE
        AND COALESCE(l.BreakStartTime, c.BreakStartTime) IS NOT NULL
        AND COALESCE(l.BreakEndTime, c.BreakEndTime) IS NOT NULL

    ORDER BY RoomName, StartTime;
$$;

-- Upsert keyed on UQ_ShiftAssignments_Therapist_Shift_Date_Start: re-submitting the same
-- therapist's window (same start time) updates it in place (room/end time can move); a different
-- start time is a second, separate window for that therapist. Does NOT touch any other
-- therapist's rows -- the caller must call sp_Scheduling_HasShiftOverlap first.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_AssignTherapistShift(
    p_LocationId int, p_TherapistId int, p_RoomId int, p_ShiftType varchar(10), p_WorkDate date,
    p_StartTime time, p_EndTime time, p_CreatedBy int, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.ShiftAssignments (LocationId, TherapistId, RoomId, ShiftType, WorkDate, StartTime, EndTime, CreatedBy)
    VALUES (p_LocationId, p_TherapistId, p_RoomId, p_ShiftType, p_WorkDate, p_StartTime, p_EndTime, p_CreatedBy)
    ON CONFLICT (LocationId, TherapistId, ShiftType, WorkDate, StartTime) WHERE IsDelete = FALSE
    DO UPDATE SET RoomId = EXCLUDED.RoomId, EndTime = EXCLUDED.EndTime, IsActive = TRUE,
                  UpdatedBy = p_CreatedBy, UpdatedDate = now()
    RETURNING Id INTO p_Id;
END;
$$;

-- A room can hold multiple therapists across a shift (primary + a proxy covering part of it), but
-- not two different therapists at the same moment. p_ExcludeTherapistId lets a therapist edit/
-- extend their own window without it colliding with itself.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasShiftOverlap(
    p_RoomId int, p_ShiftType varchar(10), p_WorkDate date, p_StartTime time, p_EndTime time, p_ExcludeTherapistId int
)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.ShiftAssignments sa
        WHERE sa.RoomId = p_RoomId AND sa.ShiftType = p_ShiftType AND sa.WorkDate = p_WorkDate AND sa.IsDelete = FALSE
            AND sa.TherapistId <> p_ExcludeTherapistId
            AND sa.StartTime < p_EndTime AND sa.EndTime > p_StartTime
    );
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_RemoveTherapistShift(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.ShiftAssignments
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Shift assignment not found.' USING ERRCODE = '50030';
    END IF;
END;
$$;

-- Shrinking a shift's window can orphan an existing booking that falls in the now-excluded time.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_UpdateTherapistShift(p_Id int, p_StartTime time, p_EndTime time, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_TherapistId int;
    v_RoomId int;
    v_WorkDate date;
BEGIN
    SELECT TherapistId, RoomId, WorkDate INTO v_TherapistId, v_RoomId, v_WorkDate
    FROM public.ShiftAssignments
    WHERE Id = p_Id AND IsDelete = FALSE;

    IF v_TherapistId IS NULL THEN
        RAISE EXCEPTION 'Shift assignment not found.' USING ERRCODE = '50031';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date = v_WorkDate
            AND (bt.TherapistId = v_TherapistId OR (v_RoomId IS NOT NULL AND bt.RoomId = v_RoomId))
            AND ((bt.StartTime AT TIME ZONE 'utc')::time < p_StartTime OR (bt.EndTime AT TIME ZONE 'utc')::time > p_EndTime)
    ) THEN
        RAISE EXCEPTION 'Cannot change this shift -- a booking already exists outside the new time window.' USING ERRCODE = '50032';
    END IF;

    UPDATE public.ShiftAssignments
    SET StartTime = p_StartTime, EndTime = p_EndTime, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;
END;
$$;

-- Ownership lookup for DELETE /therapist-shifts/{id} -- the caller checks the returned LocationId
-- against the caller's own before deleting.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_GetShiftLocationId(p_Id int)
RETURNS TABLE(LocationId int)
LANGUAGE sql STABLE AS $$
    SELECT LocationId FROM public.ShiftAssignments WHERE Id = p_Id AND IsDelete = FALSE;
$$;

-- Upsert keyed on UQ_RoomCategoryAssignments_Room_Shift_Date: a room serves one category per
-- shift/date, so "opening" it again with a different category just changes which one.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_OpenRoom(
    p_RoomId int, p_TreatmentCategoryId int, p_ShiftType varchar(10), p_WorkDate date, p_CreatedBy int, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.RoomCategoryAssignments (RoomId, TreatmentCategoryId, ShiftType, WorkDate, CreatedBy)
    VALUES (p_RoomId, p_TreatmentCategoryId, p_ShiftType, p_WorkDate, p_CreatedBy)
    ON CONFLICT (RoomId, ShiftType, WorkDate) WHERE IsDelete = FALSE
    DO UPDATE SET TreatmentCategoryId = EXCLUDED.TreatmentCategoryId, IsActive = TRUE, IsDelete = FALSE,
                  UpdatedBy = p_CreatedBy, UpdatedDate = now()
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_CloseRoom(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.RoomCategoryAssignments
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Room opening not found.' USING ERRCODE = '50031';
    END IF;
END;
$$;

-- Ownership lookup for DELETE /room-openings/{id}, resolved through the opening's Room since
-- RoomCategoryAssignments has no LocationId of its own.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_GetRoomOpeningLocationId(p_Id int)
RETURNS TABLE(LocationId int)
LANGUAGE sql STABLE AS $$
    SELECT r.LocationId
    FROM public.RoomCategoryAssignments rca
        JOIN public.Rooms r ON r.Id = rca.RoomId
    WHERE rca.Id = p_Id AND rca.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_GetShiftDetails(p_Id int)
RETURNS TABLE(LocationId int, WorkDate date, RoomId int, TherapistId int, ShiftType varchar)
LANGUAGE sql STABLE AS $$
    SELECT LocationId, WorkDate, RoomId, TherapistId, ShiftType
    FROM public.ShiftAssignments
    WHERE Id = p_Id AND IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasShiftBookings(p_ShiftId int)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.ShiftAssignments sa
        JOIN public.BookingTreatments bt ON (bt.RoomId = sa.RoomId OR bt.TherapistId = sa.TherapistId)
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date = sa.WorkDate
            AND bt.IsDelete = FALSE
        JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE sa.Id = p_ShiftId AND sa.IsDelete = FALSE
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
    );
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_GetRoomOpeningDetails(p_Id int)
RETURNS TABLE(Id int, LocationId int, RoomId int, WorkDate date, ShiftType varchar, TreatmentCategoryId int)
LANGUAGE sql STABLE AS $$
    SELECT rca.Id, r.LocationId, rca.RoomId, rca.WorkDate, rca.ShiftType, rca.TreatmentCategoryId
    FROM public.RoomCategoryAssignments rca
        JOIN public.Rooms r ON r.Id = rca.RoomId
    WHERE rca.Id = p_Id AND rca.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_GetRoomOpeningByKeys(p_RoomId int, p_WorkDate date, p_ShiftType varchar(10))
RETURNS TABLE(Id int, LocationId int, RoomId int, WorkDate date, ShiftType varchar, TreatmentCategoryId int)
LANGUAGE sql STABLE AS $$
    SELECT rca.Id, r.LocationId, rca.RoomId, rca.WorkDate, rca.ShiftType, rca.TreatmentCategoryId
    FROM public.RoomCategoryAssignments rca
        JOIN public.Rooms r ON r.Id = rca.RoomId
    WHERE rca.RoomId = p_RoomId AND rca.WorkDate = p_WorkDate AND rca.ShiftType = p_ShiftType AND rca.IsDelete = FALSE;
$$;

-- A closed room (no room opening at all for the date, any shift) has no bookable capacity to carve
-- unavailability out of -- sp_Scheduling_BlockSlot's caller checks this before blocking a slot.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasRoomOpening(p_RoomId int, p_WorkDate date)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.RoomCategoryAssignments rca
        WHERE rca.RoomId = p_RoomId AND rca.WorkDate = p_WorkDate AND rca.IsDelete = FALSE
    );
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasRoomBookings(p_RoomId int, p_WorkDate date)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.RoomId = p_RoomId
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date = p_WorkDate
            AND bt.IsDelete = FALSE
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
    );
$$;

-- Time-range-aware version of sp_Scheduling_HasRoomBookings above, used before blocking a slot --
-- a whole-day check would reject blocking e.g. a lunch break just because the room has an
-- unrelated booking elsewhere that same day.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasBookingOverlap(p_RoomId int, p_WorkDate date, p_StartTime time, p_EndTime time)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.RoomId = p_RoomId
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE 'utc')::date = p_WorkDate
            AND bt.IsDelete = FALSE
            AND (bt.StartTime AT TIME ZONE 'utc')::time < p_EndTime AND (bt.EndTime AT TIME ZONE 'utc')::time > p_StartTime
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
    );
$$;

-- Two blocks covering the same room/time would silently collide in the admin grid -- reject a new
-- block that overlaps an existing one (or the location's own lunch break) instead of allowing that
-- state to happen.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasBlockOverlap(p_RoomId int, p_WorkDate date, p_StartTime time, p_EndTime time)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.BlockedSlots bs
        WHERE bs.RoomId = p_RoomId AND bs.WorkDate = p_WorkDate AND bs.IsDelete = FALSE
            AND bs.StartTime < p_EndTime AND bs.EndTime > p_StartTime
        UNION ALL
        SELECT 1
        FROM public.Rooms r
            JOIN public.Locations l ON l.Id = r.LocationId
            JOIN public.SaloonChains c ON c.Id = l.ChainId
        WHERE r.Id = p_RoomId AND r.IsDelete = FALSE AND l.IsDelete = FALSE AND l.IsActive = TRUE
            AND COALESCE(l.BreakStartTime, c.BreakStartTime) IS NOT NULL
            AND COALESCE(l.BreakEndTime, c.BreakEndTime) IS NOT NULL
            AND COALESCE(l.BreakStartTime, c.BreakStartTime) < p_EndTime
            AND COALESCE(l.BreakEndTime, c.BreakEndTime) > p_StartTime
    );
$$;

-------------------------------------------------------------------------------------------------
-- Block types / appointment statuses / cancel reasons
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_BlockTypes_SeedDefaults() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.BlockTypes WHERE ChainId IS NULL AND LocationId IS NULL AND IsDelete = FALSE) THEN
        INSERT INTO public.BlockTypes (Name, ChainId, LocationId, IsPaid, DefaultDurationMinutes, ColorHex)
        VALUES
            ('Lunch Break', NULL, NULL, FALSE, 30, '#F59E0B'),
            ('Team Meeting', NULL, NULL, TRUE, 60, '#3B82F6'),
            ('Personal Break', NULL, NULL, FALSE, 15, '#10B981'),
            ('Training / Workshop', NULL, NULL, TRUE, 90, '#8B5CF6'),
            ('Maintenance / Cleaning', NULL, NULL, TRUE, 45, '#6B7280');
    END IF;
END;
$$;
SELECT public.sp_BlockTypes_SeedDefaults();

CREATE OR REPLACE FUNCTION public.sp_Admin_GetBlockTypes(p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, Name varchar, ChainId int, ChainName varchar, LocationId int, LocationName varchar,
              IsPaid boolean, DefaultDurationMinutes int, ColorHex varchar, IsActive boolean, CreatedDate timestamptz)
LANGUAGE sql STABLE AS $$
    -- Returns global default block types (ChainId IS NULL AND LocationId IS NULL) plus
    -- chain-scoped (if p_ChainId is passed) or location-scoped (if p_LocationId is passed).
    SELECT bt.Id, bt.Name, bt.ChainId, c.Name AS ChainName, bt.LocationId, l.Name AS LocationName,
           bt.IsPaid, bt.DefaultDurationMinutes, bt.ColorHex, bt.IsActive, bt.CreatedDate
    FROM public.BlockTypes bt
        LEFT JOIN public.SaloonChains c ON c.Id = bt.ChainId AND c.IsDelete = FALSE
        LEFT JOIN public.Locations l ON l.Id = bt.LocationId AND l.IsDelete = FALSE
    WHERE bt.IsDelete = FALSE
      AND (
          (bt.ChainId IS NULL AND bt.LocationId IS NULL) OR
          (p_ChainId IS NOT NULL AND bt.ChainId = p_ChainId) OR
          (p_LocationId IS NOT NULL AND bt.LocationId = p_LocationId) OR
          (p_LocationId IS NOT NULL AND l.ChainId = (SELECT ChainId FROM public.Locations WHERE Id = p_LocationId))
      )
    ORDER BY bt.Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_CreateBlockType(
    p_Name varchar(100), p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_IsPaid boolean DEFAULT FALSE, p_DefaultDurationMinutes int DEFAULT 30,
    p_ColorHex varchar(10) DEFAULT '#F59E0B', p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.BlockTypes (Name, ChainId, LocationId, IsPaid, DefaultDurationMinutes, ColorHex, CreatedBy)
    VALUES (p_Name, p_ChainId, p_LocationId, p_IsPaid, p_DefaultDurationMinutes, p_ColorHex, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_UpdateBlockType(
    p_Id int, p_Name varchar(100), p_IsPaid boolean, p_DefaultDurationMinutes int, p_ColorHex varchar(10),
    p_IsActive boolean, p_UpdatedBy int
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.BlockTypes
    SET Name = p_Name, IsPaid = p_IsPaid, DefaultDurationMinutes = p_DefaultDurationMinutes,
        ColorHex = p_ColorHex, IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Block type not found.' USING ERRCODE = '50060';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_DeleteBlockType(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.BlockTypes
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Block type not found.' USING ERRCODE = '50061';
    END IF;
END;
$$;

-- Same scoping shape as sp_Admin_GetBlockTypes: global defaults plus chain/location-scoped rows.
-- Plain SortOrder (no IsSystem tiebreak) is enough to pin position -- the two fixed rows sit at
-- the SMALLINT extremes (Arrived = -32768, Complete = 32767).
CREATE OR REPLACE FUNCTION public.sp_Admin_GetAppointmentStatuses(p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(Id int, Name varchar, ChainId int, ChainName varchar, LocationId int, LocationName varchar,
              ColorHex varchar, SortOrder smallint, IsSystem boolean, IsActive boolean, CreatedDate timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT s.Id, s.Name, s.ChainId, c.Name AS ChainName, s.LocationId, l.Name AS LocationName,
           s.ColorHex, s.SortOrder, s.IsSystem, s.IsActive, s.CreatedDate
    FROM public.AppointmentStatuses s
        LEFT JOIN public.SaloonChains c ON c.Id = s.ChainId AND c.IsDelete = FALSE
        LEFT JOIN public.Locations l ON l.Id = s.LocationId AND l.IsDelete = FALSE
    WHERE s.IsDelete = FALSE
      AND (
          (s.ChainId IS NULL AND s.LocationId IS NULL) OR
          (p_ChainId IS NOT NULL AND s.ChainId = p_ChainId) OR
          (p_LocationId IS NOT NULL AND s.LocationId = p_LocationId) OR
          (p_LocationId IS NOT NULL AND l.ChainId = (SELECT ChainId FROM public.Locations WHERE Id = p_LocationId))
      )
    ORDER BY s.SortOrder, s.Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_GetCancelReasons()
RETURNS TABLE(Id int, Name varchar, SortOrder smallint)
LANGUAGE sql STABLE AS $$
    SELECT Id, Name, SortOrder
    FROM public.CancelReasons
    WHERE IsDelete = FALSE AND IsActive = TRUE
    ORDER BY SortOrder, Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_CreateAppointmentStatus(
    p_Name varchar(50), p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_ColorHex varchar(10) DEFAULT '#3B82F6', p_SortOrder smallint DEFAULT 0,
    p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.AppointmentStatuses (Name, ChainId, LocationId, ColorHex, SortOrder, CreatedBy)
    VALUES (p_Name, p_ChainId, p_LocationId, p_ColorHex, p_SortOrder, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_UpdateAppointmentStatus(
    p_Id int, p_Name varchar(50), p_ColorHex varchar(10), p_SortOrder smallint, p_IsActive boolean, p_UpdatedBy int
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    IF EXISTS (SELECT 1 FROM public.AppointmentStatuses WHERE Id = p_Id AND IsSystem = TRUE) THEN
        RAISE EXCEPTION 'The Complete status is fixed and cannot be edited.' USING ERRCODE = '50065';
    END IF;

    UPDATE public.AppointmentStatuses
    SET Name = p_Name, ColorHex = p_ColorHex, SortOrder = p_SortOrder, IsActive = p_IsActive,
        UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Appointment status not found.' USING ERRCODE = '50062';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Admin_DeleteAppointmentStatus(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    IF EXISTS (SELECT 1 FROM public.AppointmentStatuses WHERE Id = p_Id AND IsSystem = TRUE) THEN
        RAISE EXCEPTION 'The Complete status is fixed and cannot be deleted.' USING ERRCODE = '50066';
    END IF;

    UPDATE public.AppointmentStatuses
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Appointment status not found.' USING ERRCODE = '50063';
    END IF;

    -- Clear it off any booking currently wearing it -- the only thing that would otherwise leave
    -- a booking pointing at a dead status.
    UPDATE public.Bookings SET AppointmentStatusId = NULL WHERE AppointmentStatusId = p_Id;
END;
$$;

-- Only a Confirmed booking can carry a progress status. Pass NULL to clear it back off.
CREATE OR REPLACE FUNCTION public.sp_Booking_SetAppointmentStatus(p_BookingId int, p_AppointmentStatusId int DEFAULT NULL, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.Bookings WHERE Id = p_BookingId AND IsDelete = FALSE AND Status = 'Confirmed') THEN
        RAISE EXCEPTION 'Only a confirmed booking can have its appointment status changed.' USING ERRCODE = '50003';
    END IF;

    IF p_AppointmentStatusId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.AppointmentStatuses WHERE Id = p_AppointmentStatusId AND IsDelete = FALSE
    ) THEN
        RAISE EXCEPTION 'Appointment status not found.' USING ERRCODE = '50064';
    END IF;

    UPDATE public.Bookings
    SET AppointmentStatusId = p_AppointmentStatusId, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_BookingId;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_BlockSlot(
    p_RoomId int, p_WorkDate date, p_StartTime time, p_EndTime time, p_Reason varchar(200),
    p_BlockTypeId int DEFAULT NULL, p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.BlockedSlots (RoomId, BlockTypeId, WorkDate, StartTime, EndTime, Reason, CreatedBy)
    VALUES (p_RoomId, p_BlockTypeId, p_WorkDate, p_StartTime, p_EndTime, p_Reason, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_UnblockSlot(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.BlockedSlots
    SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Blocked slot not found.' USING ERRCODE = '50032';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_UpdateBlockedSlot(
    p_Id int, p_BlockTypeId int DEFAULT NULL, p_StartTime time DEFAULT NULL, p_EndTime time DEFAULT NULL,
    p_Reason varchar(200) DEFAULT NULL, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.BlockedSlots
    SET BlockTypeId = p_BlockTypeId, StartTime = p_StartTime, EndTime = p_EndTime, Reason = p_Reason,
        UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Blocked slot not found.' USING ERRCODE = '50033';
    END IF;
END;
$$;

-- Ownership lookup for DELETE /blocked-slots/{id}.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_GetBlockedSlotDetails(p_Id int)
RETURNS TABLE(Id int, LocationId int, RoomId int, BlockTypeId int, BlockTypeName varchar,
              IsPaid boolean, ColorHex varchar, WorkDate date, StartTime time, EndTime time, Reason varchar)
LANGUAGE sql STABLE AS $$
    SELECT bs.Id, r.LocationId, bs.RoomId, bs.BlockTypeId, bt.Name AS BlockTypeName,
           bt.IsPaid, bt.ColorHex, bs.WorkDate, bs.StartTime, bs.EndTime, bs.Reason
    FROM public.BlockedSlots bs
        JOIN public.Rooms r ON r.Id = bs.RoomId
        LEFT JOIN public.BlockTypes bt ON bt.Id = bs.BlockTypeId AND bt.IsDelete = FALSE
    WHERE bs.Id = p_Id AND bs.IsDelete = FALSE;
$$;

-------------------------------------------------------------------------------------------------
-- Self-service profile management
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_Profile_GetStaff(p_UserId int)
RETURNS TABLE(Id int, Name varchar, Email varchar, Phone varchar, Role varchar, PhotoPath varchar, IsEmailVerified boolean)
LANGUAGE sql STABLE AS $$
    SELECT u.Id, u.Name, u.Email, u.Phone, u.Role, sp.PhotoPath, u.IsEmailVerified
    FROM public.Users u
        LEFT JOIN public.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Id = p_UserId AND u.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Profile_GetCustomer(p_UserId int)
RETURNS TABLE(Id int, Name varchar, Email varchar, Phone varchar, Role varchar, PhotoPath varchar, IsEmailVerified boolean)
LANGUAGE sql STABLE AS $$
    SELECT Id, Name, Email, Phone, Role, ProfilePhoto AS PhotoPath, IsEmailVerified
    FROM public.Users
    WHERE Id = p_UserId AND IsDelete = FALSE;
$$;

-- Deliberately narrow (Name/Phone only) -- self-service, must never touch Role/ChainId/LocationId/
-- TherapistId/IsEmulator/IsActive.
CREATE OR REPLACE FUNCTION public.sp_Profile_UpdateSelf(p_UserId int, p_Name varchar(200), p_Phone varchar(30) DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Users
    SET Name = p_Name, Phone = p_Phone, UpdatedBy = p_UserId, UpdatedDate = now()
    WHERE Id = p_UserId AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'User not found.' USING ERRCODE = '50040';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Profile_SetStaffPhoto(p_UserId int, p_PhotoPath varchar(500)) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.StaffProfiles (UserId, PhotoPath, UpdatedBy, UpdatedDate)
    VALUES (p_UserId, p_PhotoPath, p_UserId, now())
    ON CONFLICT (UserId) DO UPDATE SET PhotoPath = EXCLUDED.PhotoPath, UpdatedBy = p_UserId, UpdatedDate = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Profile_SetCustomerPhoto(p_UserId int, p_PhotoPath varchar(500)) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.Users
    SET ProfilePhoto = p_PhotoPath, UpdatedBy = p_UserId, UpdatedDate = now()
    WHERE Id = p_UserId AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Customer not found.' USING ERRCODE = '50041';
    END IF;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Payments
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_Payment_Create(
    p_BookingId int, p_Amount numeric(10,2), p_Currency varchar(10), p_Provider varchar(30),
    p_PaymentMethod varchar(30), p_Status varchar(20), p_TransactionId varchar(200) DEFAULT NULL,
    p_ClientSecret varchar(500) DEFAULT NULL, p_CreatedBy int DEFAULT NULL, p_TipAmount numeric(10,2) DEFAULT 0
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_Id int;
BEGIN
    INSERT INTO public.Payments
        (BookingId, Amount, TipAmount, Currency, Provider, PaymentMethod, Status, TransactionId, ClientSecret, CreatedBy, CreatedDate)
    VALUES
        (p_BookingId, p_Amount, p_TipAmount, p_Currency, p_Provider, p_PaymentMethod, p_Status, p_TransactionId, p_ClientSecret, p_CreatedBy, now())
    RETURNING Id INTO v_Id;

    RETURN v_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Payment_UpdateStatus(
    p_PaymentId int, p_Status varchar(20), p_TransactionId varchar(200) DEFAULT NULL,
    p_FailureReason varchar(500) DEFAULT NULL, p_UpdatedBy int DEFAULT NULL, p_AmountTendered numeric(10,2) DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.Payments
    SET Status = p_Status,
        TransactionId = COALESCE(p_TransactionId, TransactionId),
        FailureReason = p_FailureReason,
        AmountTendered = COALESCE(p_AmountTendered, AmountTendered),
        UpdatedBy = p_UpdatedBy,
        UpdatedDate = now()
    WHERE Id = p_PaymentId AND IsDelete = FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Payment_GetByBookingId(p_BookingId int)
RETURNS TABLE(Id int, BookingId int, Amount numeric, Currency varchar, Provider varchar, PaymentMethod varchar,
              Status varchar, TransactionId varchar, ClientSecret varchar, FailureReason varchar,
              CreatedBy int, CreatedDate timestamptz, TipAmount numeric, AmountTendered numeric)
LANGUAGE sql STABLE AS $$
    SELECT Id, BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, ClientSecret, FailureReason, CreatedBy, CreatedDate, TipAmount, AmountTendered
    FROM public.Payments
    WHERE BookingId = p_BookingId AND IsDelete = FALSE
    ORDER BY Id DESC;
$$;

CREATE OR REPLACE FUNCTION public.sp_Payment_GetById(p_Id int)
RETURNS TABLE(Id int, BookingId int, Amount numeric, Currency varchar, Provider varchar, PaymentMethod varchar,
              Status varchar, TransactionId varchar, ClientSecret varchar, FailureReason varchar,
              CreatedBy int, CreatedDate timestamptz, TipAmount numeric, AmountTendered numeric)
LANGUAGE sql STABLE AS $$
    SELECT Id, BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, ClientSecret, FailureReason, CreatedBy, CreatedDate, TipAmount, AmountTendered
    FROM public.Payments
    WHERE Id = p_Id AND IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_User_UpdateStripeCustomerId(p_UserId int, p_StripeCustomerId varchar(200)) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.Users
    SET StripeCustomerId = p_StripeCustomerId, UpdatedDate = now()
    WHERE Id = p_UserId AND IsDelete = FALSE;
$$;

-- Backs AdminSeeder -- skip creating the bootstrap RootSuperAdmin if one already exists under any email.
CREATE OR REPLACE FUNCTION public.sp_User_ExistsWithRole(p_Role varchar(20)) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.Users WHERE Role = p_Role AND IsDelete = FALSE);
$$;

CREATE OR REPLACE FUNCTION public.sp_User_IsLocationInChain(p_LocationId int, p_ChainId int) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.Locations WHERE Id = p_LocationId AND ChainId = p_ChainId AND IsDelete = FALSE);
$$;

CREATE OR REPLACE FUNCTION public.sp_User_HasCustomerBookingInChain(p_CustomerId int, p_ChainId int) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.Bookings b
        JOIN public.Locations l ON l.Id = b.LocationId
        WHERE b.CustomerId = p_CustomerId AND l.ChainId = p_ChainId AND b.IsDelete = FALSE
    );
$$;

-- EXISTS-based matching only touches Treatments/TreatmentCategories when p_Search is actually
-- non-empty, and never fans the row set out (unlike a LEFT JOIN + SELECT DISTINCT would).
CREATE OR REPLACE FUNCTION public.sp_Catalog_Search(p_Search varchar(200) DEFAULT NULL)
RETURNS TABLE(Id int, ChainId int, ChainName varchar, Name varchar, Address varchar,
              OpenTime time, CloseTime time, WorkingDaysMask smallint, TimeZoneId varchar,
              AverageRating numeric, ReviewCount bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_Term varchar(200) := NULLIF(TRIM(p_Search), '');
BEGIN
    RETURN QUERY
    SELECT
        l.Id, l.ChainId, c.Name AS ChainName, l.Name, l.Address,
        l.OpenTime, l.CloseTime, l.WorkingDaysMask, l.TimeZoneId,
        r.AverageRating, r.ReviewCount
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
        LEFT JOIN (
            SELECT LocationId, AVG(Rating)::numeric(3,2) AS AverageRating, COUNT(*) AS ReviewCount
            FROM public.Reviews WHERE IsDelete = FALSE
            GROUP BY LocationId
        ) r ON r.LocationId = l.Id
    WHERE l.IsDelete = FALSE AND l.IsActive = TRUE AND c.IsDelete = FALSE AND c.IsActive = TRUE
        AND (
            v_Term IS NULL OR
            c.Name ILIKE '%' || v_Term || '%' OR
            l.Name ILIKE '%' || v_Term || '%' OR
            l.Address ILIKE '%' || v_Term || '%' OR
            EXISTS (
                SELECT 1 FROM public.Treatments t
                WHERE t.LocationId = l.Id AND t.IsDelete = FALSE AND t.IsActive = TRUE
                    AND t.Name ILIKE '%' || v_Term || '%'
            ) OR
            EXISTS (
                SELECT 1 FROM public.Treatments t
                    JOIN public.TreatmentCategories tc ON tc.Id = t.CategoryId AND tc.IsDelete = FALSE AND tc.IsActive = TRUE
                WHERE t.LocationId = l.Id AND t.IsDelete = FALSE AND t.IsActive = TRUE
                    AND tc.Name ILIKE '%' || v_Term || '%'
            )
        )
    ORDER BY l.Name;
END;
$$;

-- One review per booking -- eligibility (Confirmed, every treatment's EndTime already passed) is
-- re-derived here, not trusted from the client.
CREATE OR REPLACE FUNCTION public.sp_Review_Create(p_BookingId int, p_CustomerId int, p_Rating smallint, p_Comment varchar(1000) DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    v_LocationId int;
    v_Id int;
BEGIN
    SELECT b.LocationId INTO v_LocationId
    FROM public.Bookings b
    WHERE b.Id = p_BookingId AND b.CustomerId = p_CustomerId AND b.Status = 'Confirmed' AND b.IsDelete = FALSE
        AND NOT EXISTS (
            SELECT 1 FROM public.BookingTreatments bt
            WHERE bt.BookingId = b.Id AND bt.IsDelete = FALSE AND (bt.EndTime IS NULL OR bt.EndTime > now())
        );

    IF v_LocationId IS NULL THEN
        RAISE EXCEPTION 'This booking is not eligible for a review yet.' USING ERRCODE = '50050';
    END IF;

    IF EXISTS (SELECT 1 FROM public.Reviews WHERE BookingId = p_BookingId AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'This booking has already been reviewed.' USING ERRCODE = '50051';
    END IF;

    INSERT INTO public.Reviews (BookingId, CustomerId, LocationId, Rating, Comment)
    VALUES (p_BookingId, p_CustomerId, v_LocationId, p_Rating, p_Comment)
    RETURNING Id INTO v_Id;

    RETURN v_Id;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Admin dashboard stats (single-purpose functions -- see fn_Admin_DashboardScopedLocations/
-- fn_Admin_DashboardKpis/fn_Admin_DashboardUpcoming below)
-------------------------------------------------------------------------------------------------

-- Shared role/chain/location scoping rule, factored out so both fn_Admin_DashboardKpis and
-- fn_Admin_DashboardUpcoming below can compute it identically without duplicating the branching --
-- each calls this into its own local temp table instead of sharing one across two function calls
-- (which two independent RETURNS TABLE functions can't do the way this proc's two OPEN statements
-- used to).
CREATE OR REPLACE FUNCTION public.fn_Admin_DashboardScopedLocations(p_Role varchar(50), p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL)
RETURNS TABLE(LocationId int)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_Role IN ('RootSuperAdmin', 'root_super_admin') THEN
        RETURN QUERY SELECT Id FROM public.Locations WHERE IsDelete = FALSE AND IsActive = TRUE;
    ELSIF p_Role IN ('SuperAdmin', 'Admin', 'superadmin', 'admin') AND p_ChainId IS NOT NULL THEN
        RETURN QUERY SELECT Id FROM public.Locations WHERE ChainId = p_ChainId AND IsDelete = FALSE AND IsActive = TRUE;
    ELSIF p_LocationId IS NOT NULL THEN
        RETURN QUERY SELECT p_LocationId;
    ELSIF p_ChainId IS NOT NULL THEN
        RETURN QUERY SELECT Id FROM public.Locations WHERE ChainId = p_ChainId AND IsDelete = FALSE AND IsActive = TRUE;
    ELSE
        RETURN QUERY SELECT Id FROM public.Locations WHERE IsDelete = FALSE AND IsActive = TRUE;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_Admin_DashboardKpis(
    p_Role varchar(50), p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_StartDate date DEFAULT NULL, p_EndDate date DEFAULT NULL
)
RETURNS TABLE(TodayRevenue numeric, YesterdayRevenue numeric, AppointmentsToday int, AppointmentsInProgress int, ActiveTherapists int)
LANGUAGE plpgsql AS $$
DECLARE
    v_StartDate date := COALESCE(p_StartDate, public.fn_UtcToday());
    v_EndDate date := COALESCE(p_EndDate, v_StartDate);
    v_Yesterday date := v_StartDate - 1;
    -- Half-open [Start, End) instant bounds instead of casting StartTime to DATE -- keeps every
    -- comparison against BookingTreatments.StartTime/Payments.CreatedDate a plain range predicate.
    v_StartDateTime timestamptz := (v_StartDate::timestamp AT TIME ZONE 'utc');
    v_EndDateTimeExcl timestamptz := ((v_EndDate + 1)::timestamp AT TIME ZONE 'utc');
    v_YesterdayDateTime timestamptz := (v_Yesterday::timestamp AT TIME ZONE 'utc');
    v_TodayRevenue numeric(18,2) := 0;
    v_YesterdayRevenue numeric(18,2) := 0;
    v_AppointmentsToday int := 0;
    v_AppointmentsInProgress int := 0;
    v_ActiveTherapists int := 0;
BEGIN
    CREATE TEMP TABLE scoped_locations_kpi (LocationId int PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO scoped_locations_kpi SELECT * FROM public.fn_Admin_DashboardScopedLocations(p_Role, p_ChainId, p_LocationId);

    SELECT COALESCE(SUM(p.Amount), 0) INTO v_TodayRevenue
    FROM public.Payments p
        JOIN public.Bookings b ON b.Id = p.BookingId
        JOIN scoped_locations_kpi sl ON sl.LocationId = b.LocationId
    WHERE p.Status = 'Succeeded'
      AND p.IsDelete = FALSE
      AND p.CreatedDate >= v_StartDateTime AND p.CreatedDate < v_EndDateTimeExcl;

    SELECT COALESCE(SUM(p.Amount), 0) INTO v_YesterdayRevenue
    FROM public.Payments p
        JOIN public.Bookings b ON b.Id = p.BookingId
        JOIN scoped_locations_kpi sl ON sl.LocationId = b.LocationId
    WHERE p.Status = 'Succeeded'
      AND p.IsDelete = FALSE
      AND p.CreatedDate >= v_YesterdayDateTime AND p.CreatedDate < v_StartDateTime;

    -- The "unscheduled, fell back to CreatedDate" branch only matters when the range could
    -- contain today (CreatedDate can never be in the future) -- an actual IF, not a WHERE-clause
    -- guard, mirroring the original's reasoning for keeping that branch out of the plan entirely
    -- when the requested range is wholly future-dated.
    IF v_StartDateTime <= now() THEN
        WITH qualifying_bookings AS (
            SELECT DISTINCT b.Id, b.Status
            FROM public.Bookings b
                JOIN public.BookingTreatments bt ON bt.BookingId = b.Id
                JOIN scoped_locations_kpi sl ON sl.LocationId = b.LocationId
            WHERE b.Status <> 'Cancelled' AND b.IsDelete = FALSE AND bt.IsDelete = FALSE
              AND bt.StartTime >= v_StartDateTime AND bt.StartTime < v_EndDateTimeExcl

            UNION

            SELECT DISTINCT b.Id, b.Status
            FROM public.Bookings b
                JOIN public.BookingTreatments bt ON bt.BookingId = b.Id
                JOIN scoped_locations_kpi sl ON sl.LocationId = b.LocationId
            WHERE b.Status <> 'Cancelled' AND b.IsDelete = FALSE AND bt.IsDelete = FALSE
              AND bt.StartTime IS NULL
              AND b.CreatedDate >= v_StartDateTime AND b.CreatedDate < v_EndDateTimeExcl
        )
        SELECT COUNT(*), COALESCE(SUM(CASE WHEN Status = 'Confirmed' THEN 1 ELSE 0 END), 0)
        INTO v_AppointmentsToday, v_AppointmentsInProgress
        FROM qualifying_bookings;
    ELSE
        SELECT COUNT(DISTINCT b.Id), COUNT(DISTINCT CASE WHEN b.Status = 'Confirmed' THEN b.Id END)
        INTO v_AppointmentsToday, v_AppointmentsInProgress
        FROM public.Bookings b
            JOIN public.BookingTreatments bt ON bt.BookingId = b.Id
            JOIN scoped_locations_kpi sl ON sl.LocationId = b.LocationId
        WHERE b.Status <> 'Cancelled' AND b.IsDelete = FALSE AND bt.IsDelete = FALSE
          AND bt.StartTime >= v_StartDateTime AND bt.StartTime < v_EndDateTimeExcl;
    END IF;

    SELECT COUNT(DISTINCT tp.Id) INTO v_ActiveTherapists
    FROM public.TherapistProfile tp
    WHERE tp.IsActive = TRUE AND tp.IsDelete = FALSE
      AND (
          tp.LocationId IN (SELECT LocationId FROM scoped_locations_kpi)
          OR tp.LocationId IS NULL
      );

    RETURN QUERY
    SELECT v_TodayRevenue, v_YesterdayRevenue, v_AppointmentsToday, v_AppointmentsInProgress, v_ActiveTherapists;
END;
$$;

-- Today's / date-range upcoming appointments list. Two independently-seekable branches (has a
-- scheduled line in range, or is still unscheduled but was created in range), each narrowed to its
-- own top-20 candidates first, before the display columns (Locations/Users/TherapistProfile/price
-- subquery) are joined onto just those rows.
CREATE OR REPLACE FUNCTION public.fn_Admin_DashboardUpcoming(
    p_Role varchar(50), p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_StartDate date DEFAULT NULL, p_EndDate date DEFAULT NULL
)
RETURNS TABLE(BookingId int, AppointmentDate date, StartTimeSlot time, EndTimeSlot time,
              CustomerName varchar, LocationName varchar, TherapistName varchar, Status varchar, TotalAmount numeric)
LANGUAGE plpgsql AS $$
DECLARE
    v_StartDate date := COALESCE(p_StartDate, public.fn_UtcToday());
    v_EndDate date := COALESCE(p_EndDate, v_StartDate);
    v_StartDateTime timestamptz := (v_StartDate::timestamp AT TIME ZONE 'utc');
    v_EndDateTimeExcl timestamptz := ((v_EndDate + 1)::timestamp AT TIME ZONE 'utc');
BEGIN
    CREATE TEMP TABLE scoped_locations_upcoming (LocationId int PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO scoped_locations_upcoming SELECT * FROM public.fn_Admin_DashboardScopedLocations(p_Role, p_ChainId, p_LocationId);

    CREATE TEMP TABLE candidates (
        BookingId int, StartTime timestamptz, EndTime timestamptz, TherapistId int,
        CreatedDate timestamptz, LocationId int, CustomerId int, Status varchar(10)
    ) ON COMMIT DROP;

    INSERT INTO candidates (BookingId, StartTime, EndTime, TherapistId, CreatedDate, LocationId, CustomerId, Status)
    SELECT b.Id, bt.StartTime, bt.EndTime, bt.TherapistId, b.CreatedDate, b.LocationId, b.CustomerId, b.Status
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN scoped_locations_upcoming sl ON sl.LocationId = b.LocationId
    WHERE bt.SequenceOrder = 1 AND bt.IsDelete = FALSE
      AND b.IsDelete = FALSE AND b.Status <> 'Cancelled'
      AND bt.StartTime >= v_StartDateTime AND bt.StartTime < v_EndDateTimeExcl
    ORDER BY bt.StartTime
    LIMIT 20;

    IF v_StartDateTime <= now() THEN
        INSERT INTO candidates (BookingId, StartTime, EndTime, TherapistId, CreatedDate, LocationId, CustomerId, Status)
        SELECT b.Id, NULL, NULL, NULL, b.CreatedDate, b.LocationId, b.CustomerId, b.Status
        FROM public.Bookings b
            JOIN scoped_locations_upcoming sl ON sl.LocationId = b.LocationId
        WHERE b.IsDelete = FALSE AND b.Status <> 'Cancelled'
          AND b.CreatedDate >= v_StartDateTime AND b.CreatedDate < v_EndDateTimeExcl
          AND NOT EXISTS (
              SELECT 1 FROM public.BookingTreatments bt2
              WHERE bt2.BookingId = b.Id AND bt2.SequenceOrder = 1 AND bt2.IsDelete = FALSE AND bt2.StartTime IS NOT NULL
          )
        ORDER BY b.CreatedDate
        LIMIT 20;
    END IF;

    RETURN QUERY
    SELECT
        c.BookingId,
        (COALESCE(c.StartTime, c.CreatedDate) AT TIME ZONE 'utc')::date AS AppointmentDate,
        (COALESCE(c.StartTime, c.CreatedDate) AT TIME ZONE 'utc')::time AS StartTimeSlot,
        (COALESCE(c.EndTime, c.CreatedDate + interval '30 minutes') AT TIME ZONE 'utc')::time AS EndTimeSlot,
        u.Name AS CustomerName,
        l.Name AS LocationName,
        tp.Name AS TherapistName,
        c.Status,
        -- Aliased and qualified (bt.BookingId, not bare BookingId) -- this function's own
        -- RETURNS TABLE(BookingId int, ...) column makes "BookingId" a PL/pgSQL variable in scope
        -- here, which an unqualified reference to BookingTreatments.BookingId would collide with
        -- ("column reference is ambiguous").
        COALESCE((SELECT SUM(bt.Price) FROM public.BookingTreatments bt WHERE bt.BookingId = c.BookingId AND bt.IsDelete = FALSE), 0) AS TotalAmount
    FROM candidates c
        JOIN public.Locations l ON l.Id = c.LocationId
        JOIN public.Users u ON u.Id = c.CustomerId
        LEFT JOIN public.TherapistProfile tp ON tp.Id = c.TherapistId
    ORDER BY COALESCE(c.StartTime, c.CreatedDate)
    LIMIT 20;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Inventory
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_Inventory_CreateSupplier(
    p_ChainId int, p_Name varchar(200), p_ContactEmail varchar(256) DEFAULT NULL, p_ContactPhone varchar(30) DEFAULT NULL, p_CreatedBy int DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_Id int;
BEGIN
    INSERT INTO public.Suppliers (ChainId, Name, ContactEmail, ContactPhone, CreatedBy)
    VALUES (p_ChainId, p_Name, p_ContactEmail, p_ContactPhone, p_CreatedBy)
    RETURNING Id INTO v_Id;
    RETURN v_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_GetSuppliers(p_ChainId int)
RETURNS TABLE(Id int, ChainId int, Name varchar, ContactEmail varchar, ContactPhone varchar, IsActive boolean)
LANGUAGE sql STABLE AS $$
    SELECT Id, ChainId, Name, ContactEmail, ContactPhone, IsActive
    FROM public.Suppliers
    WHERE ChainId = p_ChainId AND IsDelete = FALSE
    ORDER BY Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_UpdateSupplier(
    p_Id int, p_Name varchar(200), p_ContactEmail varchar(256) DEFAULT NULL, p_ContactPhone varchar(30) DEFAULT NULL,
    p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.Suppliers
    SET Name = p_Name, ContactEmail = p_ContactEmail, ContactPhone = p_ContactPhone, IsActive = p_IsActive,
        UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_DeleteSupplier(p_Id int, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.Suppliers SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now() WHERE Id = p_Id;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_CreateProduct(
    p_LocationId int, p_SupplierId int DEFAULT NULL, p_Name varchar(200) DEFAULT NULL, p_SKU varchar(50) DEFAULT NULL,
    p_Price numeric(10,2) DEFAULT NULL, p_QuantityOnHand int DEFAULT 0, p_ReorderThreshold int DEFAULT 0, p_CreatedBy int DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_Id int;
BEGIN
    INSERT INTO public.Products (LocationId, SupplierId, Name, SKU, Price, QuantityOnHand, ReorderThreshold, CreatedBy)
    VALUES (p_LocationId, p_SupplierId, p_Name, p_SKU, p_Price, p_QuantityOnHand, p_ReorderThreshold, p_CreatedBy)
    RETURNING Id INTO v_Id;
    RETURN v_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_GetProducts(p_LocationId int)
RETURNS TABLE(Id int, LocationId int, SupplierId int, SupplierName varchar, Name varchar, SKU varchar,
              Price numeric, QuantityOnHand int, ReorderThreshold int, IsActive boolean)
LANGUAGE sql STABLE AS $$
    SELECT p.Id, p.LocationId, p.SupplierId, s.Name AS SupplierName, p.Name, p.SKU, p.Price,
        p.QuantityOnHand, p.ReorderThreshold, p.IsActive
    FROM public.Products p
        LEFT JOIN public.Suppliers s ON s.Id = p.SupplierId
    WHERE p.LocationId = p_LocationId AND p.IsDelete = FALSE
    ORDER BY p.Name;
$$;

-- QuantityOnHand is deliberately not a parameter here -- stock only ever moves through
-- sp_Inventory_ReceivePurchaseOrder or a booking confirm/cancel, never a direct edit.
CREATE OR REPLACE FUNCTION public.sp_Inventory_UpdateProduct(
    p_Id int, p_SupplierId int DEFAULT NULL, p_Name varchar(200) DEFAULT NULL, p_SKU varchar(50) DEFAULT NULL,
    p_Price numeric(10,2) DEFAULT NULL, p_ReorderThreshold int DEFAULT NULL, p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.Products
    SET SupplierId = p_SupplierId, Name = p_Name, SKU = p_SKU, Price = p_Price, ReorderThreshold = p_ReorderThreshold,
        IsActive = p_IsActive, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_DeleteProduct(p_Id int, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.Products SET IsDelete = TRUE, UpdatedBy = p_UpdatedBy, UpdatedDate = now() WHERE Id = p_Id;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_GetLowStockProducts(p_LocationId int)
RETURNS TABLE(Id int, Name varchar, SKU varchar, QuantityOnHand int, ReorderThreshold int)
LANGUAGE sql STABLE AS $$
    SELECT Id, Name, SKU, QuantityOnHand, ReorderThreshold
    FROM public.Products
    WHERE LocationId = p_LocationId AND IsDelete = FALSE AND IsActive = TRUE AND QuantityOnHand <= ReorderThreshold
    ORDER BY QuantityOnHand;
$$;

-- p_Lines is jsonb, not public.PurchaseOrderLineType[] -- the C# caller (AsPurchaseOrderLineList
-- in DapperSp.cs) already serializes the line list to a JSON string rather than binding an actual
-- Npgsql composite-array parameter (that needs a one-time NpgsqlDataSource.MapComposite<T>() call
-- this codebase never made), so a composite-array-typed parameter here could never actually be
-- called -- "function ... does not exist" for every purchase order, every time.
CREATE OR REPLACE FUNCTION public.sp_Inventory_CreatePurchaseOrder(
    p_LocationId int, p_SupplierId int, p_Lines jsonb, p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    IF p_Lines IS NULL OR jsonb_array_length(p_Lines) = 0 THEN
        RAISE EXCEPTION 'A purchase order needs at least one line.' USING ERRCODE = '50053';
    END IF;

    INSERT INTO public.PurchaseOrders (LocationId, SupplierId, CreatedBy)
    VALUES (p_LocationId, p_SupplierId, p_CreatedBy)
    RETURNING Id INTO p_Id;

    INSERT INTO public.PurchaseOrderLines (PurchaseOrderId, ProductId, QuantityOrdered, UnitCost)
    SELECT p_Id, (line->>'ProductId')::int, (line->>'Quantity')::int, (line->>'UnitCost')::numeric(10,2)
    FROM jsonb_array_elements(p_Lines) AS line;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Inventory_GetPurchaseOrders(p_LocationId int)
RETURNS TABLE(Id int, LocationId int, SupplierId int, SupplierName varchar, Status varchar, ReceivedDate timestamptz,
              CreatedDate timestamptz, TotalCost numeric)
LANGUAGE sql STABLE AS $$
    SELECT po.Id, po.LocationId, po.SupplierId, s.Name AS SupplierName, po.Status, po.ReceivedDate, po.CreatedDate,
        COALESCE((SELECT SUM(QuantityOrdered * UnitCost) FROM public.PurchaseOrderLines WHERE PurchaseOrderId = po.Id), 0) AS TotalCost
    FROM public.PurchaseOrders po
        JOIN public.Suppliers s ON s.Id = po.SupplierId
    WHERE po.LocationId = p_LocationId AND po.IsDelete = FALSE
    ORDER BY po.CreatedDate DESC;
$$;

CREATE OR REPLACE FUNCTION public.fn_Inventory_PurchaseOrderHeader(p_Id int)
RETURNS TABLE(Id int, LocationId int, SupplierId int, SupplierName varchar, Status varchar, ReceivedDate timestamptz, CreatedDate timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT po.Id, po.LocationId, po.SupplierId, s.Name AS SupplierName, po.Status, po.ReceivedDate, po.CreatedDate
    FROM public.PurchaseOrders po
        JOIN public.Suppliers s ON s.Id = po.SupplierId
    WHERE po.Id = p_Id AND po.IsDelete = FALSE;
$$;

CREATE OR REPLACE FUNCTION public.fn_Inventory_PurchaseOrderLines(p_Id int)
RETURNS TABLE(Id int, ProductId int, ProductName varchar, QuantityOrdered int, UnitCost numeric)
LANGUAGE sql STABLE AS $$
    SELECT pol.Id, pol.ProductId, p.Name AS ProductName, pol.QuantityOrdered, pol.UnitCost
    FROM public.PurchaseOrderLines pol
        JOIN public.Products p ON p.Id = pol.ProductId
    WHERE pol.PurchaseOrderId = p_Id;
$$;

-- Full receive only (no partial-quantity receiving) -- bumps each line's product stock by exactly
-- what was ordered and marks the whole PO Received.
CREATE OR REPLACE FUNCTION public.sp_Inventory_ReceivePurchaseOrder(p_Id int, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.PurchaseOrders WHERE Id = p_Id AND IsDelete = FALSE AND Status = 'Ordered') THEN
        RAISE EXCEPTION 'Purchase order not found or already received/cancelled.' USING ERRCODE = '50054';
    END IF;

    UPDATE public.Products p
    SET QuantityOnHand = p.QuantityOnHand + pol.QuantityOrdered, UpdatedDate = now()
    FROM public.PurchaseOrderLines pol
    WHERE pol.ProductId = p.Id AND pol.PurchaseOrderId = p_Id;

    UPDATE public.PurchaseOrders
    SET Status = 'Received', ReceivedDate = now(), UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id;
END;
$$;

-- Draft-only, same rule the treatment-line procs already enforce. UnitPrice is captured from
-- Products.Price now, not read live later, so an existing cart line survives a price change.
CREATE OR REPLACE FUNCTION public.sp_Booking_AddProduct(
    p_BookingId int, p_ProductId int, p_Quantity int, p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
DECLARE v_UnitPrice numeric(10,2);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.Bookings WHERE Id = p_BookingId AND Status = 'Draft' AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Booking not found or already finalized.' USING ERRCODE = '50055';
    END IF;

    SELECT Price INTO v_UnitPrice FROM public.Products WHERE Id = p_ProductId AND IsDelete = FALSE AND IsActive = TRUE;
    IF v_UnitPrice IS NULL THEN
        RAISE EXCEPTION 'Product not found or inactive.' USING ERRCODE = '50056';
    END IF;

    INSERT INTO public.BookingProducts (BookingId, ProductId, Quantity, UnitPrice, CreatedBy)
    VALUES (p_BookingId, p_ProductId, p_Quantity, v_UnitPrice, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_RemoveProduct(p_Id int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.BookingProducts SET IsDelete = TRUE WHERE Id = p_Id AND IsDelete = FALSE;
    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Booking product line not found.' USING ERRCODE = '50057';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Booking_GetProducts(p_BookingId int)
RETURNS TABLE(Id int, ProductId int, ProductName varchar, Quantity int, UnitPrice numeric, LineTotal numeric)
LANGUAGE sql STABLE AS $$
    SELECT bp.Id, bp.ProductId, p.Name AS ProductName, bp.Quantity, bp.UnitPrice, (bp.Quantity * bp.UnitPrice) AS LineTotal
    FROM public.BookingProducts bp
        JOIN public.Products p ON p.Id = bp.ProductId
    WHERE bp.BookingId = p_BookingId AND bp.IsDelete = FALSE;
$$;

-------------------------------------------------------------------------------------------------
-- Team pay (commissions + pay runs)
-------------------------------------------------------------------------------------------------

-- Upserts on (LocationId, TherapistKey) -- p_TherapistId NULL sets/replaces the location's own
-- default rule, matching UX_CommissionRules_Location_Therapist's generated TherapistKey column.
CREATE OR REPLACE FUNCTION public.sp_Payroll_UpsertCommissionRule(
    p_LocationId int, p_TherapistId int DEFAULT NULL, p_Type varchar(10) DEFAULT NULL, p_Rate numeric(10,2) DEFAULT NULL,
    p_HourlyRate numeric(10,2) DEFAULT 0, p_OvertimeThresholdHours numeric(5,2) DEFAULT 40.0,
    p_OvertimeRateMultiplier numeric(5,2) DEFAULT 1.5, p_CreatedBy int DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_Id int;
BEGIN
    INSERT INTO public.CommissionRules (LocationId, TherapistId, Type, Rate, HourlyRate, OvertimeThresholdHours, OvertimeRateMultiplier, CreatedBy)
    VALUES (p_LocationId, p_TherapistId, p_Type, p_Rate, p_HourlyRate, p_OvertimeThresholdHours, p_OvertimeRateMultiplier, p_CreatedBy)
    ON CONFLICT (LocationId, TherapistKey) WHERE IsDelete = FALSE
    DO UPDATE SET Type = EXCLUDED.Type, Rate = EXCLUDED.Rate, HourlyRate = EXCLUDED.HourlyRate,
                  OvertimeThresholdHours = EXCLUDED.OvertimeThresholdHours, OvertimeRateMultiplier = EXCLUDED.OvertimeRateMultiplier,
                  UpdatedBy = p_CreatedBy, UpdatedDate = now()
    RETURNING Id INTO v_Id;

    RETURN v_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Payroll_GetCommissionRules(p_LocationId int)
RETURNS TABLE(Id int, LocationId int, TherapistId int, TherapistName varchar, Type varchar, Rate numeric,
              HourlyRate numeric, OvertimeThresholdHours numeric, OvertimeRateMultiplier numeric)
LANGUAGE sql STABLE AS $$
    SELECT cr.Id, cr.LocationId, cr.TherapistId, tp.Name AS TherapistName, cr.Type, cr.Rate,
           cr.HourlyRate, cr.OvertimeThresholdHours, cr.OvertimeRateMultiplier
    FROM public.CommissionRules cr
        LEFT JOIN public.TherapistProfile tp ON tp.Id = cr.TherapistId
    WHERE cr.LocationId = p_LocationId AND cr.IsDelete = FALSE
    ORDER BY CASE WHEN cr.TherapistId IS NULL THEN 0 ELSE 1 END, tp.Name;
$$;

CREATE OR REPLACE FUNCTION public.sp_Payroll_DeleteCommissionRule(p_Id int) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.CommissionRules SET IsDelete = TRUE, UpdatedDate = now() WHERE Id = p_Id;
$$;

-- Snapshots gross Confirmed-treatment revenue per therapist over the period into frozen
-- PayRunLines rows, calculating base commission, hourly base wage, overtime hours/pay, and total pay.
CREATE OR REPLACE FUNCTION public.sp_Payroll_CreatePayRun(
    p_LocationId int, p_PeriodStart date, p_PeriodEnd date, p_CreatedBy int DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
BEGIN
    -- Serializes the overlap check + insert against a concurrent generate call for this same
    -- location -- without it two concurrent calls for overlapping-but-not-identical periods could
    -- both pass the EXISTS check (each under its own snapshot) and both INSERT. Same advisory-lock
    -- pattern as the booking-scheduling functions above, standing in for the T-SQL original's
    -- WITH (UPDLOCK, HOLDLOCK) read.
    PERFORM pg_advisory_xact_lock(hashtextextended('payrun_' || p_LocationId::text, 0));

    -- Regenerating the exact same location+period while it's still Draft is a legitimate "redo".
    DELETE FROM public.PayRuns
    WHERE LocationId = p_LocationId AND PeriodStart = p_PeriodStart AND PeriodEnd = p_PeriodEnd AND Status = 'Draft';

    -- Any OTHER pay run (Draft or Finalized) whose period overlaps this one at all would
    -- double-count Confirmed revenue for the overlapping days across two runs.
    IF EXISTS (
        SELECT 1 FROM public.PayRuns
        WHERE LocationId = p_LocationId AND PeriodStart <= p_PeriodEnd AND PeriodEnd >= p_PeriodStart
    ) THEN
        RAISE EXCEPTION 'A pay run already exists for a date range overlapping this period.' USING ERRCODE = '50067';
    END IF;

    INSERT INTO public.PayRuns (LocationId, PeriodStart, PeriodEnd, CreatedBy)
    VALUES (p_LocationId, p_PeriodStart, p_PeriodEnd, p_CreatedBy)
    RETURNING Id INTO p_Id;

    WITH gross AS (
        SELECT bt.TherapistId, SUM(bt.Price) AS GrossSales, COUNT(*) AS LineCount,
            SUM(bt.SlotCount) * 15.0 / 60.0 AS HoursWorked
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId
        WHERE b.LocationId = p_LocationId AND b.Status = 'Confirmed' AND b.IsDelete = FALSE AND bt.IsDelete = FALSE
            AND bt.TherapistId IS NOT NULL
            AND (bt.StartTime AT TIME ZONE 'utc')::date BETWEEN p_PeriodStart AND p_PeriodEnd
        GROUP BY bt.TherapistId
    ),
    rule_resolved AS (
        SELECT g.TherapistId, g.GrossSales, g.LineCount, g.HoursWorked,
            COALESCE(specific.Type, def.Type, 'Percent') AS CommissionType,
            COALESCE(specific.Rate, def.Rate, 0) AS CommissionRate,
            CASE
                WHEN COALESCE(specific.HourlyRate, def.HourlyRate, 0) > 0 THEN COALESCE(specific.HourlyRate, def.HourlyRate, 0)
                WHEN COALESCE(specific.Type, def.Type, 'Percent') = 'Hourly' THEN COALESCE(specific.Rate, def.Rate, 0)
                ELSE 0
            END AS HourlyRate,
            COALESCE(specific.OvertimeThresholdHours, def.OvertimeThresholdHours, 40.0) AS OvertimeThresholdHours,
            COALESCE(specific.OvertimeRateMultiplier, def.OvertimeRateMultiplier, 1.5) AS OvertimeRateMultiplier
        FROM gross g
            LEFT JOIN public.CommissionRules specific ON specific.LocationId = p_LocationId AND specific.TherapistId = g.TherapistId AND specific.IsDelete = FALSE
            LEFT JOIN public.CommissionRules def ON def.LocationId = p_LocationId AND def.TherapistId IS NULL AND def.IsDelete = FALSE
    ),
    calculated AS (
        SELECT TherapistId, GrossSales, HoursWorked, CommissionType, CommissionRate, HourlyRate, LineCount,
            CASE WHEN HoursWorked > OvertimeThresholdHours THEN OvertimeThresholdHours ELSE HoursWorked END AS RegularHours,
            CASE WHEN HoursWorked > OvertimeThresholdHours THEN (HoursWorked - OvertimeThresholdHours) ELSE 0 END AS OvertimeHours,
            CASE CommissionType
                WHEN 'Percent' THEN ROUND(GrossSales * CommissionRate / 100.0, 2)
                WHEN 'Flat' THEN ROUND(CommissionRate * LineCount, 2)
                ELSE 0.00
            END AS CommissionAmount,
            OvertimeRateMultiplier
        FROM rule_resolved
    )
    INSERT INTO public.PayRunLines (
        PayRunId, TherapistId, GrossSales, HoursWorked, RegularHours, OvertimeHours, HourlyRate,
        CommissionRate, CommissionType, CommissionAmount, OvertimePay, TotalPay
    )
    SELECT p_Id, TherapistId, GrossSales, ROUND(HoursWorked, 2), ROUND(RegularHours, 2), ROUND(OvertimeHours, 2), HourlyRate,
        CommissionRate, CommissionType, CommissionAmount,
        ROUND(OvertimeHours * HourlyRate * OvertimeRateMultiplier, 2) AS OvertimePay,
        ROUND(CommissionAmount + (RegularHours * HourlyRate) + (OvertimeHours * HourlyRate * OvertimeRateMultiplier), 2) AS TotalPay
    FROM calculated;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Payroll_GetPayRuns(p_LocationId int)
RETURNS TABLE(Id int, LocationId int, PeriodStart date, PeriodEnd date, Status varchar, FinalizedDate timestamptz,
              CreatedDate timestamptz, TotalCommission numeric)
LANGUAGE sql STABLE AS $$
    SELECT pr.Id, pr.LocationId, pr.PeriodStart, pr.PeriodEnd, pr.Status, pr.FinalizedDate, pr.CreatedDate,
        COALESCE((SELECT SUM(TotalPay) FROM public.PayRunLines WHERE PayRunId = pr.Id), 0) AS TotalCommission
    FROM public.PayRuns pr
    WHERE pr.LocationId = p_LocationId
    ORDER BY pr.PeriodStart DESC;
$$;

CREATE OR REPLACE FUNCTION public.fn_Payroll_PayRunHeader(p_Id int)
RETURNS TABLE(Id int, LocationId int, PeriodStart date, PeriodEnd date, Status varchar, FinalizedDate timestamptz, CreatedDate timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT Id, LocationId, PeriodStart, PeriodEnd, Status, FinalizedDate, CreatedDate FROM public.PayRuns WHERE Id = p_Id;
$$;

CREATE OR REPLACE FUNCTION public.fn_Payroll_PayRunLines(p_Id int)
RETURNS TABLE(Id int, TherapistId int, TherapistName varchar, GrossSales numeric, HoursWorked numeric,
              RegularHours numeric, OvertimeHours numeric, HourlyRate numeric, CommissionRate numeric, CommissionType varchar,
              CommissionAmount numeric, OvertimePay numeric, TotalPay numeric)
LANGUAGE sql STABLE AS $$
    SELECT prl.Id, prl.TherapistId, tp.Name AS TherapistName, prl.GrossSales, prl.HoursWorked,
        prl.RegularHours, prl.OvertimeHours, prl.HourlyRate, prl.CommissionRate, prl.CommissionType,
        prl.CommissionAmount, prl.OvertimePay, prl.TotalPay
    FROM public.PayRunLines prl
        JOIN public.TherapistProfile tp ON tp.Id = prl.TherapistId
    WHERE prl.PayRunId = p_Id
    ORDER BY prl.TotalPay DESC;
$$;

CREATE OR REPLACE FUNCTION public.sp_Payroll_FinalizePayRun(p_Id int, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.PayRuns
    SET Status = 'Finalized', FinalizedDate = now(), UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND Status = 'Draft';

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Pay run not found or already finalized.' USING ERRCODE = '50058';
    END IF;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Reporting
-------------------------------------------------------------------------------------------------

-- Confirmed only, and only once its own start time has passed -- re-derives eligibility
-- server-side rather than trusting the caller's clock.
CREATE OR REPLACE FUNCTION public.sp_Booking_MarkNoShow(p_BookingId int, p_UpdatedBy int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.Bookings WHERE Id = p_BookingId AND Status = 'Confirmed' AND IsDelete = FALSE) THEN
        RAISE EXCEPTION 'Booking not found or not Confirmed.' USING ERRCODE = '50059';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.BookingTreatments
        WHERE BookingId = p_BookingId AND IsDelete = FALSE AND (StartTime IS NULL OR StartTime > now())
    ) THEN
        RAISE EXCEPTION 'Booking has not started yet.' USING ERRCODE = '50060';
    END IF;

    UPDATE public.Bookings
    SET Status = 'NoShow', UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_BookingId;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Report_SalesByService(p_LocationId int, p_From date, p_To date)
RETURNS TABLE(TreatmentId int, TreatmentName varchar, CategoryName varchar, BookingCount bigint, TotalRevenue numeric)
LANGUAGE sql STABLE AS $$
    SELECT t.Id AS TreatmentId, t.Name AS TreatmentName, tc.Name AS CategoryName,
        COUNT(*) AS BookingCount, SUM(bt.Price) AS TotalRevenue
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN public.Treatments t ON t.Id = bt.TreatmentId
        JOIN public.TreatmentCategories tc ON tc.Id = t.CategoryId
    WHERE b.LocationId = p_LocationId AND b.Status = 'Confirmed' AND bt.IsDelete = FALSE
        AND (bt.StartTime AT TIME ZONE 'utc')::date BETWEEN p_From AND p_To
    GROUP BY t.Id, t.Name, tc.Name
    ORDER BY TotalRevenue DESC;
$$;

CREATE OR REPLACE FUNCTION public.sp_Report_SalesByStaff(p_LocationId int, p_From date, p_To date)
RETURNS TABLE(TherapistId int, TherapistName varchar, BookingCount bigint, TotalRevenue numeric)
LANGUAGE sql STABLE AS $$
    SELECT tp.Id AS TherapistId, tp.Name AS TherapistName,
        COUNT(*) AS BookingCount, SUM(bt.Price) AS TotalRevenue
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN public.TherapistProfile tp ON tp.Id = bt.TherapistId
    WHERE b.LocationId = p_LocationId AND b.Status = 'Confirmed' AND bt.IsDelete = FALSE
        AND (bt.StartTime AT TIME ZONE 'utc')::date BETWEEN p_From AND p_To
    GROUP BY tp.Id, tp.Name
    ORDER BY TotalRevenue DESC;
$$;

CREATE OR REPLACE FUNCTION public.sp_Report_SalesByLocation(p_ChainId int, p_From date, p_To date)
RETURNS TABLE(LocationId int, LocationName varchar, BookingCount bigint, TotalRevenue numeric)
LANGUAGE sql STABLE AS $$
    SELECT l.Id AS LocationId, l.Name AS LocationName,
        COUNT(*) AS BookingCount, SUM(bt.Price) AS TotalRevenue
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN public.Locations l ON l.Id = b.LocationId
    WHERE l.ChainId = p_ChainId AND b.Status = 'Confirmed' AND bt.IsDelete = FALSE
        AND (bt.StartTime AT TIME ZONE 'utc')::date BETWEEN p_From AND p_To
    GROUP BY l.Id, l.Name
    ORDER BY TotalRevenue DESC;
$$;

-- "Retention" = of the customers who had a Confirmed booking at this location in the period, what
-- share had already been bound to it before the period started -- a repeat, not a first-time, customer.
CREATE OR REPLACE FUNCTION public.sp_Report_Retention(p_LocationId int, p_From date, p_To date)
RETURNS TABLE(TotalCustomers bigint, ReturningCustomers bigint, RetentionRatePercent numeric)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH visiting_customers AS (
        SELECT DISTINCT b.CustomerId
        FROM public.Bookings b
            JOIN public.BookingTreatments bt ON bt.BookingId = b.Id AND bt.IsDelete = FALSE
        WHERE b.LocationId = p_LocationId AND b.Status = 'Confirmed' AND b.IsDelete = FALSE
            AND (bt.StartTime AT TIME ZONE 'utc')::date BETWEEN p_From AND p_To
    )
    SELECT
        COUNT(*) AS TotalCustomers,
        SUM(CASE WHEN cl.CreatedDate < (p_From::timestamp AT TIME ZONE 'utc') THEN 1 ELSE 0 END) AS ReturningCustomers,
        CASE WHEN COUNT(*) = 0 THEN 0
             ELSE ROUND(100.0 * SUM(CASE WHEN cl.CreatedDate < (p_From::timestamp AT TIME ZONE 'utc') THEN 1 ELSE 0 END) / COUNT(*), 1)
        END AS RetentionRatePercent
    FROM visiting_customers vc
        JOIN public.CustomerLocations cl ON cl.CustomerId = vc.CustomerId AND cl.LocationId = p_LocationId AND cl.IsDelete = FALSE;
END;
$$;

-- Only counts bookings whose own appointment date already fell within the period -- a future
-- Confirmed booking hasn't had the chance to no-show yet and would otherwise dilute the rate.
CREATE OR REPLACE FUNCTION public.sp_Report_NoShowRate(p_LocationId int, p_From date, p_To date)
RETURNS TABLE(TotalAppointments bigint, NoShowCount bigint, NoShowRatePercent numeric)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH appointments AS (
        SELECT b.Id, b.Status, MIN(bt.StartTime) AS StartTime
        FROM public.Bookings b
            JOIN public.BookingTreatments bt ON bt.BookingId = b.Id AND bt.IsDelete = FALSE
        WHERE b.LocationId = p_LocationId AND b.IsDelete = FALSE AND b.Status IN ('Confirmed','NoShow')
        GROUP BY b.Id, b.Status
    )
    SELECT
        COUNT(*) AS TotalAppointments,
        SUM(CASE WHEN Status = 'NoShow' THEN 1 ELSE 0 END) AS NoShowCount,
        CASE WHEN COUNT(*) = 0 THEN 0
             ELSE ROUND(100.0 * SUM(CASE WHEN Status = 'NoShow' THEN 1 ELSE 0 END) / COUNT(*), 1)
        END AS NoShowRatePercent
    FROM appointments
    WHERE (StartTime AT TIME ZONE 'utc')::date BETWEEN p_From AND p_To;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Staff attendance & proxy assignment
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_Staff_GetAttendance(p_LocationId int, p_WorkDate date)
RETURNS TABLE(UserId int, StaffName varchar, StaffEmail varchar, StaffRole varchar, AttendanceId int,
              LocationId int, WorkDate date, ArrivalTime time, LeftTime time, LoggedDate timestamptz, LoggedByUserId int)
LANGUAGE sql STABLE AS $$
    SELECT
        u.Id AS UserId,
        u.Name AS StaffName,
        u.Email AS StaffEmail,
        u.Role AS StaffRole,
        sa.Id AS AttendanceId,
        sa.LocationId,
        p_WorkDate AS WorkDate,
        sa.ArrivalTime,
        sa.LeftTime,
        sa.CreatedDate AS LoggedDate,
        sa.CreatedBy AS LoggedByUserId
    FROM public.Users u
        LEFT JOIN public.StaffAttendance sa
            ON sa.UserId = u.Id AND sa.LocationId = p_LocationId AND sa.WorkDate = p_WorkDate
    WHERE u.LocationId = p_LocationId AND u.IsDelete = FALSE AND u.IsActive = TRUE
    ORDER BY u.Name;
$$;

-- Logs arrival or departure/left time for a staff member. IMMUTABILITY: once ArrivalTime or
-- LeftTime is non-null, it cannot be changed.
CREATE OR REPLACE FUNCTION public.sp_Staff_LogAttendance(
    p_LocationId int, p_UserId int, p_WorkDate date, p_ArrivalTime time, p_LeftTime time, p_LoggedBy int
)
RETURNS TABLE(AttendanceId int, LocationId int, UserId int, WorkDate date, ArrivalTime time, LeftTime time)
LANGUAGE plpgsql AS $$
DECLARE
    v_ExistingArrival time;
    v_ExistingLeft time;
BEGIN
    SELECT sa.ArrivalTime, sa.LeftTime INTO v_ExistingArrival, v_ExistingLeft
    FROM public.StaffAttendance sa
    WHERE sa.LocationId = p_LocationId AND sa.UserId = p_UserId AND sa.WorkDate = p_WorkDate;

    IF p_ArrivalTime IS NOT NULL AND v_ExistingArrival IS NOT NULL THEN
        RAISE EXCEPTION 'Arrival time is immutable once set and cannot be modified.' USING ERRCODE = '50040';
    END IF;

    IF p_LeftTime IS NOT NULL AND v_ExistingLeft IS NOT NULL THEN
        RAISE EXCEPTION 'Departure/Left time is immutable once set and cannot be modified.' USING ERRCODE = '50041';
    END IF;

    -- Aliased and qualified throughout (sa.LocationId, not bare LocationId) -- this function's own
    -- RETURNS TABLE(LocationId int, UserId int, WorkDate date, ArrivalTime time, LeftTime time, ...)
    -- makes those names PL/pgSQL variables in scope here, which an unqualified reference to
    -- StaffAttendance's own columns of the same name would collide with ("ambiguous").
    IF EXISTS (SELECT 1 FROM public.StaffAttendance sa WHERE sa.LocationId = p_LocationId AND sa.UserId = p_UserId AND sa.WorkDate = p_WorkDate) THEN
        UPDATE public.StaffAttendance sa
        SET ArrivalTime = COALESCE(sa.ArrivalTime, p_ArrivalTime),
            LeftTime = COALESCE(sa.LeftTime, p_LeftTime),
            UpdatedBy = p_LoggedBy,
            UpdatedDate = now()
        WHERE sa.LocationId = p_LocationId AND sa.UserId = p_UserId AND sa.WorkDate = p_WorkDate;
    ELSE
        INSERT INTO public.StaffAttendance (LocationId, UserId, WorkDate, ArrivalTime, LeftTime, CreatedBy)
        VALUES (p_LocationId, p_UserId, p_WorkDate, p_ArrivalTime, p_LeftTime, p_LoggedBy);
    END IF;

    RETURN QUERY
    SELECT sa.Id, sa.LocationId, sa.UserId, sa.WorkDate, sa.ArrivalTime, sa.LeftTime
    FROM public.StaffAttendance sa
    WHERE sa.LocationId = p_LocationId AND sa.UserId = p_UserId AND sa.WorkDate = p_WorkDate;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Staff_GetLocationManagers(p_LocationId int)
RETURNS TABLE(UserId int, Name varchar, Email varchar, Role varchar)
LANGUAGE sql STABLE AS $$
    SELECT Id AS UserId, Name, Email, Role
    FROM public.Users
    WHERE LocationId = p_LocationId AND Role IN ('Manager', 'Admin', 'SuperAdmin', 'RootSuperAdmin') AND IsActive = TRUE AND IsDelete = FALSE;
$$;

-- Identifies upcoming bookings starting within the next N minutes (location/chain lead time,
-- default 30) where the assigned staff member has NOT logged arrival for today yet.
CREATE OR REPLACE FUNCTION public.sp_Staff_GetUnattendedPreBookingAlerts()
RETURNS TABLE(BookingId int, LocationId int, LocationName varchar, BookingTreatmentId int, TreatmentName varchar,
              StartTime timestamptz, EndTime timestamptz, TherapistId int, AssignedStaffName varchar,
              AssignedStaffEmail varchar, CustomerName varchar, LeadTimeMinutes int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_Now timestamptz := now();
    v_Today date := (v_Now AT TIME ZONE 'utc')::date;
BEGIN
    RETURN QUERY
    SELECT
        b.Id AS BookingId,
        b.LocationId,
        loc.Name AS LocationName,
        bt.Id AS BookingTreatmentId,
        t.Name AS TreatmentName,
        bt.StartTime,
        bt.EndTime,
        bt.TherapistId,
        COALESCE(u.Name, tp.Name) AS AssignedStaffName,
        u.Email AS AssignedStaffEmail,
        cust.Name AS CustomerName,
        COALESCE(loc.StaffEarlyArrivalMinutes, chain.StaffEarlyArrivalMinutes, 30) AS LeadTimeMinutes
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId AND b.Status = 'Confirmed' AND b.IsDelete = FALSE
        JOIN public.Locations loc ON loc.Id = b.LocationId AND loc.IsDelete = FALSE
        JOIN public.SaloonChains chain ON chain.Id = loc.ChainId AND chain.IsDelete = FALSE
        JOIN public.Treatments t ON t.Id = bt.TreatmentId
        -- bt.TherapistId is a TherapistProfile.Id, not a Users.Id -- must resolve through
        -- TherapistProfile.UserId to reach the staff login/email.
        JOIN public.TherapistProfile tp ON tp.Id = bt.TherapistId
        LEFT JOIN public.Users u ON u.Id = tp.UserId
        JOIN public.Users cust ON cust.Id = b.CustomerId
        LEFT JOIN public.StaffAttendance sa
            ON sa.LocationId = b.LocationId AND sa.UserId = tp.UserId AND sa.WorkDate = v_Today AND sa.ArrivalTime IS NOT NULL
    WHERE bt.IsDelete = FALSE
      AND bt.ProxyTherapistId IS NULL
      AND (bt.StartTime AT TIME ZONE 'utc')::date = v_Today
      AND sa.Id IS NULL -- Staff has NOT logged arrival today yet!
      AND EXTRACT(EPOCH FROM (bt.StartTime - v_Now)) / 60 BETWEEN 0 AND COALESCE(loc.StaffEarlyArrivalMinutes, chain.StaffEarlyArrivalMinutes, 30);
END;
$$;

-- Assigns a proxy / alternate therapist for a confirmed booking treatment line.
CREATE OR REPLACE FUNCTION public.sp_Booking_AssignProxyTherapist(p_BookingTreatmentId int, p_ProxyTherapistId int, p_UpdatedBy int)
RETURNS TABLE(BookingTreatmentId int, BookingId int, LocationId int, LocationName varchar, TreatmentName varchar,
              StartTime timestamptz, EndTime timestamptz, OriginalTherapistId int, OriginalTherapistName varchar,
              ProxyTherapistId int, ProxyTherapistName varchar, ProxyTherapistEmail varchar, CustomerName varchar)
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    UPDATE public.BookingTreatments
    SET ProxyTherapistId = p_ProxyTherapistId,
        UpdatedBy = p_UpdatedBy,
        UpdatedDate = now()
    WHERE Id = p_BookingTreatmentId AND IsDelete = FALSE;

    GET DIAGNOSTICS v_RowCount = ROW_COUNT;
    IF v_RowCount = 0 THEN
        RAISE EXCEPTION 'Booking treatment line not found.' USING ERRCODE = '50042';
    END IF;

    RETURN QUERY
    SELECT
        bt.Id AS BookingTreatmentId,
        bt.BookingId,
        b.LocationId,
        loc.Name AS LocationName,
        t.Name AS TreatmentName,
        bt.StartTime,
        bt.EndTime,
        bt.TherapistId AS OriginalTherapistId,
        COALESCE(orig.Name, origTp.Name) AS OriginalTherapistName,
        bt.ProxyTherapistId,
        proxy.Name AS ProxyTherapistName,
        proxy.Email AS ProxyTherapistEmail,
        cust.Name AS CustomerName
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN public.Locations loc ON loc.Id = b.LocationId
        JOIN public.Treatments t ON t.Id = bt.TreatmentId
        JOIN public.TherapistProfile origTp ON origTp.Id = bt.TherapistId
        LEFT JOIN public.Users orig ON orig.Id = origTp.UserId
        JOIN public.Users proxy ON proxy.Id = bt.ProxyTherapistId
        JOIN public.Users cust ON cust.Id = b.CustomerId
    WHERE bt.Id = p_BookingTreatmentId;
END;
$$;

-------------------------------------------------------------------------------------------------
-- Email outbox (public.EmailOutbox). Enqueue on the request/business path; claim + send from
-- EmailQueueBackgroundService. fn_EmailOutbox_Claim uses FOR UPDATE SKIP LOCKED so multiple API
-- nodes dispatch disjoint batches with no distributed lock.
-------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sp_EmailOutbox_Enqueue(p_Payload jsonb, p_Subject varchar) RETURNS bigint
LANGUAGE sql AS $$
    INSERT INTO public.EmailOutbox (Payload, Subject)
    VALUES (p_Payload, LEFT(COALESCE(p_Subject, ''), 500))
    RETURNING Id;
$$;

-- Atomically claims up to p_BatchSize due rows: bumps Attempts and hides each row for
-- p_VisibilitySeconds (so a dispatcher crash mid-send just means the row retries after the
-- timeout, having spent one attempt). MarkSent / MarkFailed finalize the outcome.
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

-- Attempts was already incremented by the claim. Exhausted (>= p_MaxAttempts) -> 'Failed';
-- otherwise stay 'Pending' with NextAttemptAt pushed out by a linear backoff. Pass p_MaxAttempts
-- = 0 to fail a row permanently (used for an unparseable payload that can never succeed).
CREATE OR REPLACE FUNCTION public.sp_EmailOutbox_MarkFailed(
    p_Id bigint, p_Error text, p_MaxAttempts int, p_BackoffBaseSeconds int) RETURNS void
LANGUAGE sql AS $$
    UPDATE public.EmailOutbox
    SET Status = CASE WHEN Attempts >= p_MaxAttempts THEN 'Failed' ELSE 'Pending' END,
        NextAttemptAt = now() + make_interval(secs => p_BackoffBaseSeconds * GREATEST(Attempts, 1)),
        LastError = LEFT(COALESCE(p_Error, ''), 4000)
    WHERE Id = p_Id;
$$;
