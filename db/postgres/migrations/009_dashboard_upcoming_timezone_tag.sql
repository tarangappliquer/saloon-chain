-- 009_dashboard_upcoming_timezone_tag.sql
-- fn_Admin_DashboardUpcoming already returns StartTime/EndTime as raw timestamptz instants (see
-- 007_dashboard_upcoming_display_timezone.sql) for the frontend to convert. Admin panel policy is
-- now: every time is shown in the LOCATION's own timezone, not the admin's browser zone, with a
-- visible tag naming which zone that is -- see BookingsPage/BookingDetailPanel/CalendarPage, which
-- already do this via Locations.TimeZoneId threaded down as a prop.
--
-- This widget has no single "the location" though -- fn_Admin_DashboardScopedLocations can scope a
-- RootSuperAdmin/SuperAdmin/Admin to many locations across a chain (or all chains), each potentially
-- in a different zone, all in one list. So TimeZoneId has to travel per-row, not as one page-level
-- value. RETURNS TABLE column list changed -- DROP first (Postgres won't CREATE OR REPLACE across
-- that; see 005/007/008 for the same situation).
SET search_path TO public;

DROP FUNCTION IF EXISTS public.fn_Admin_DashboardUpcoming(varchar, int, int, date, date);
CREATE FUNCTION public.fn_Admin_DashboardUpcoming(
    p_Role varchar(50), p_ChainId int DEFAULT NULL, p_LocationId int DEFAULT NULL,
    p_StartDate date DEFAULT NULL, p_EndDate date DEFAULT NULL
)
RETURNS TABLE(BookingId int, StartTime timestamptz, EndTime timestamptz,
              CustomerName varchar, LocationName varchar, TherapistName varchar, Status varchar, TotalAmount numeric,
              TimeZoneId varchar)
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
        COALESCE(c.StartTime, c.CreatedDate) AS StartTime,
        COALESCE(c.EndTime, c.CreatedDate + interval '30 minutes') AS EndTime,
        u.Name AS CustomerName,
        l.Name AS LocationName,
        tp.Name AS TherapistName,
        c.Status,
        COALESCE((SELECT SUM(bt.Price) FROM public.BookingTreatments bt WHERE bt.BookingId = c.BookingId AND bt.IsDelete = FALSE), 0) AS TotalAmount,
        l.TimeZoneId
    FROM candidates c
        JOIN public.Locations l ON l.Id = c.LocationId
        JOIN public.Users u ON u.Id = c.CustomerId
        LEFT JOIN public.TherapistProfile tp ON tp.Id = c.TherapistId
    ORDER BY COALESCE(c.StartTime, c.CreatedDate)
    LIMIT 20;
END;
$$;
