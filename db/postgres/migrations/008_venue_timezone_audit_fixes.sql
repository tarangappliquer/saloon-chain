-- 008_venue_timezone_audit_fixes.sql
-- Broader audit of every remaining `AT TIME ZONE 'utc'` extraction off BookingTreatments.StartTime/
-- EndTime (a true UTC instant since 004/005) compared against a venue-local business concept
-- (OpenTime/CloseTime, LocationDaySchedule, WorkingDaysMask/DayBit, ShiftAssignments.WorkDate,
-- StaffAttendance.WorkDate) -- the same bug shape 004_validate_slot_eligibility_venue_timezone.sql
-- and 005_availability_location_timezone.sql already fixed for the core booking-availability path,
-- left standing everywhere else in this file. For any location whose TimeZoneId isn't UTC, these
-- silently drifted a booking onto the wrong calendar date/day-bit/time-of-day whenever the venue's
-- offset carried it across a UTC-day boundary, which could:
--   * let an hours/day-schedule/shift-window edit through that actually orphans an existing booking
--     (or wrongly BLOCK a legitimate edit), because the booking's own StartTime looked out-of-range
--     against raw-UTC digits;
--   * report a room/shift as free (sp_Scheduling_HasRoomBookings/HasShiftBookings/HasBookingOverlap)
--     when it actually has a booking that day, or vice versa;
--   * close a location over a date range (sp_Admin_CreateLocationClosures) that still has a booking,
--     because that booking's UTC-extracted date fell just outside the requested range while its
--     venue-local date fell inside it (or vice versa);
--   * fire (or miss) a staff "unattended pre-booking" alert against the wrong local "today"
--     (sp_Staff_GetUnattendedPreBookingAlerts), and match it against the wrong day's
--     StaffAttendance.WorkDate row.
-- Also fixes the same shape on fn_UtcToday() call sites gating LocationDaySchedule.EffectiveFrom
-- ("has this schedule change already taken effect") -- EffectiveFrom is a venue-local calendar
-- date, so a single global UTC "today" is wrong for any location that isn't itself UTC.
--
-- Fix, uniformly: resolve the row's OWN location's TimeZoneId (via whatever join/lookup already
-- reaches Locations, or a fresh one where none existed) and derive date/day-bit/time-of-day via
-- `AT TIME ZONE` that zone instead of a hardcoded 'utc' or a precomputed global "today".
--
-- fn_Booking_ConfirmationHeader also gains a TimeZoneId output column so BookingService can render
-- booking-confirmation/cancellation emails in the venue's own local time instead of the raw UTC
-- instant BookingTreatments.StartTime stores (see BookingService.BuildConfirmationEmailAsync/
-- BuildCancellationEmailAsync) -- its RETURNS TABLE column list changed, hence the DROP first (see
-- 005/007 for the same situation).
SET search_path TO public;

-- 1) fn_Booking_AvailabilityScheduledLines / fn_Booking_AvailabilityRangeScheduledLines: "anywhere,
-- not scoped to a single location" (per their own header comment), so each row resolves its own
-- booking's location zone via a fresh join instead of a caller-supplied p_LocationId.
CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityScheduledLines(p_WorkDate date, p_ExcludeBookingId int DEFAULT NULL)
RETURNS TABLE(RoomId int, TherapistId int, StartTime timestamptz, EndTime timestamptz, Status varchar)
LANGUAGE sql STABLE AS $$
    SELECT bt.RoomId, bt.TherapistId, bt.StartTime, bt.EndTime, b.Status
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN public.Locations loc ON loc.Id = b.LocationId
    WHERE bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date = p_WorkDate
        AND bt.IsDelete = FALSE AND b.IsDelete = FALSE
        AND (p_ExcludeBookingId IS NULL OR b.Id <> p_ExcludeBookingId)
        AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()));
$$;

CREATE OR REPLACE FUNCTION public.fn_Booking_AvailabilityRangeScheduledLines(p_FromDate date, p_ToDate date, p_ExcludeBookingId int DEFAULT NULL)
RETURNS TABLE(RoomId int, TherapistId int, StartTime timestamptz, EndTime timestamptz, Status varchar)
LANGUAGE sql STABLE AS $$
    SELECT bt.RoomId, bt.TherapistId, bt.StartTime, bt.EndTime, b.Status
    FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId
        JOIN public.Locations loc ON loc.Id = b.LocationId
    WHERE bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date BETWEEN p_FromDate AND p_ToDate
        AND bt.IsDelete = FALSE AND b.IsDelete = FALSE
        AND (p_ExcludeBookingId IS NULL OR b.Id <> p_ExcludeBookingId)
        AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()));
$$;

-- 2) fn_Booking_ForLocationHeaders / fn_Booking_ForLocationTreatments: already scoped to a single
-- p_LocationId, so just resolve that location's zone instead of assuming UTC.
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
            WHERE bt.BookingId = b.Id AND bt.IsDelete = FALSE AND (bt.StartTime AT TIME ZONE l.TimeZoneId)::date = p_WorkDate
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
        JOIN public.Locations loc ON loc.Id = p_LocationId
    WHERE b.LocationId = p_LocationId AND b.IsDelete = FALSE AND bt.IsDelete = FALSE
        AND b.Status <> 'Cancelled'
        AND (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date = p_WorkDate
    ORDER BY bt.StartTime;
$$;

-- 3) sp_Catalog_UpdateLocation: validate future bookings against the zone this location is ABOUT
-- to have (p_TimeZoneId), falling back to its current one if the caller genuinely omitted it.
CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateLocation(
    p_Id int, p_Name varchar(200), p_Address varchar(400) DEFAULT NULL,
    p_Latitude numeric(9,6) DEFAULT NULL, p_Longitude numeric(9,6) DEFAULT NULL,
    p_OpenTime time DEFAULT NULL, p_CloseTime time DEFAULT NULL,
    p_BreakStartTime time DEFAULT NULL, p_BreakEndTime time DEFAULT NULL,
    p_WorkingDaysMask smallint DEFAULT NULL, p_TimeZoneId varchar(100) DEFAULT NULL,
    p_IsActive boolean DEFAULT TRUE, p_UpdatedBy int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_RowCount int;
    v_TimeZoneId varchar := COALESCE(p_TimeZoneId, (SELECT TimeZoneId FROM public.Locations WHERE Id = p_Id));
BEGIN
    IF p_IsActive = FALSE AND EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE b.LocationId = p_Id AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND bt.StartTime >= now()
    ) THEN
        RAISE EXCEPTION 'Cannot deactivate this location -- it has existing bookings.' USING ERRCODE = '50034';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE b.LocationId = p_Id AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND bt.StartTime >= now()
            AND NOT EXISTS (
                SELECT 1 FROM public.LocationDaySchedule ds
                WHERE ds.LocationId = p_Id
                    AND ds.DayBit = public.fn_DayBit((bt.StartTime AT TIME ZONE v_TimeZoneId)::date)
                    AND ds.EffectiveFrom <= (bt.StartTime AT TIME ZONE v_TimeZoneId)::date
                    AND (ds.EffectiveTo IS NULL OR ds.EffectiveTo >= (bt.StartTime AT TIME ZONE v_TimeZoneId)::date)
                    AND ds.IsDelete = FALSE
            )
            AND (
                (p_WorkingDaysMask & public.fn_DayBit((bt.StartTime AT TIME ZONE v_TimeZoneId)::date)) = 0
                OR (bt.StartTime AT TIME ZONE v_TimeZoneId)::time < p_OpenTime
                OR (bt.EndTime AT TIME ZONE v_TimeZoneId)::time > p_CloseTime
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

-- 4) sp_Catalog_AddLocationDaySchedule / sp_Catalog_UpdateLocationDaySchedule /
-- sp_Catalog_DeleteLocationDaySchedule: resolve the location's own zone instead of assuming UTC,
-- both for the existing-booking guard and for the fn_UtcToday() "already in effect" checks
-- (EffectiveFrom is a venue-local calendar date).
CREATE OR REPLACE FUNCTION public.sp_Catalog_AddLocationDaySchedule(
    p_LocationId int, p_DayBit smallint, p_EffectiveFrom date, p_CreatedBy int,
    p_OpenTime time DEFAULT NULL, p_CloseTime time DEFAULT NULL, p_IsClosed boolean DEFAULT FALSE,
    p_EffectiveTo date DEFAULT NULL, OUT p_Id int
)
LANGUAGE plpgsql AS $$
DECLARE
    v_TimeZoneId varchar := (SELECT TimeZoneId FROM public.Locations WHERE Id = p_LocationId);
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

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE b.LocationId = p_LocationId AND bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL
            AND (bt.StartTime AT TIME ZONE v_TimeZoneId)::date >= p_EffectiveFrom
            AND (p_EffectiveTo IS NULL OR (bt.StartTime AT TIME ZONE v_TimeZoneId)::date <= p_EffectiveTo)
            AND public.fn_DayBit((bt.StartTime AT TIME ZONE v_TimeZoneId)::date) = p_DayBit
            AND (p_IsClosed = TRUE OR (bt.StartTime AT TIME ZONE v_TimeZoneId)::time < p_OpenTime OR (bt.EndTime AT TIME ZONE v_TimeZoneId)::time > p_CloseTime)
    ) THEN
        RAISE EXCEPTION 'Cannot schedule these hours -- a booking already exists outside the new hours (or on a day being closed).' USING ERRCODE = '50073';
    END IF;

    INSERT INTO public.LocationDaySchedule (LocationId, DayBit, OpenTime, CloseTime, IsClosed, EffectiveFrom, EffectiveTo, CreatedBy)
    VALUES (p_LocationId, p_DayBit, p_OpenTime, p_CloseTime, p_IsClosed, p_EffectiveFrom, p_EffectiveTo, p_CreatedBy)
    RETURNING Id INTO p_Id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Catalog_UpdateLocationDaySchedule(
    p_Id int, p_EffectiveFrom date, p_UpdatedBy int,
    p_OpenTime time DEFAULT NULL, p_CloseTime time DEFAULT NULL, p_IsClosed boolean DEFAULT FALSE,
    p_EffectiveTo date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_LocationId int;
    v_DayBit smallint;
    v_TimeZoneId varchar;
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

    SELECT TimeZoneId INTO v_TimeZoneId FROM public.Locations WHERE Id = v_LocationId;

    IF EXISTS (
        SELECT 1 FROM public.LocationDaySchedule
        WHERE Id = p_Id AND EffectiveFrom <= (now() AT TIME ZONE v_TimeZoneId)::date
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
            AND (bt.StartTime AT TIME ZONE v_TimeZoneId)::date >= p_EffectiveFrom
            AND (p_EffectiveTo IS NULL OR (bt.StartTime AT TIME ZONE v_TimeZoneId)::date <= p_EffectiveTo)
            AND public.fn_DayBit((bt.StartTime AT TIME ZONE v_TimeZoneId)::date) = v_DayBit
            AND (p_IsClosed = TRUE OR (bt.StartTime AT TIME ZONE v_TimeZoneId)::time < p_OpenTime OR (bt.EndTime AT TIME ZONE v_TimeZoneId)::time > p_CloseTime)
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

CREATE OR REPLACE FUNCTION public.sp_Catalog_DeleteLocationDaySchedule(p_Id int, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_RowCount int;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.LocationDaySchedule ds
            JOIN public.Locations loc ON loc.Id = ds.LocationId
        WHERE ds.Id = p_Id AND ds.IsDelete = FALSE AND ds.EffectiveFrom <= (now() AT TIME ZONE loc.TimeZoneId)::date
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

-- 5) sp_Admin_CreateLocationClosures: each target location can have its own TimeZoneId, so resolve
-- every booking's OWN location's zone via the same join already scoping it to p_LocationIds.
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
            JOIN public.Locations loc ON loc.Id = b.LocationId
        WHERE (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date BETWEEN p_FromDate AND p_ToDate
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

-- 6) sp_Scheduling_UpdateTherapistShift / HasShiftBookings / HasRoomBookings / HasBookingOverlap:
-- resolve the shift/room's own location zone instead of assuming UTC.
CREATE OR REPLACE FUNCTION public.sp_Scheduling_UpdateTherapistShift(p_Id int, p_StartTime time, p_EndTime time, p_UpdatedBy int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_TherapistId int;
    v_RoomId int;
    v_WorkDate date;
    v_LocationId int;
    v_TimeZoneId varchar;
BEGIN
    SELECT TherapistId, RoomId, WorkDate, LocationId INTO v_TherapistId, v_RoomId, v_WorkDate, v_LocationId
    FROM public.ShiftAssignments
    WHERE Id = p_Id AND IsDelete = FALSE;

    IF v_TherapistId IS NULL THEN
        RAISE EXCEPTION 'Shift assignment not found.' USING ERRCODE = '50031';
    END IF;

    SELECT TimeZoneId INTO v_TimeZoneId FROM public.Locations WHERE Id = v_LocationId;

    IF EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
            JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE bt.IsDelete = FALSE AND b.Status <> 'Cancelled'
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE v_TimeZoneId)::date = v_WorkDate
            AND (bt.TherapistId = v_TherapistId OR (v_RoomId IS NOT NULL AND bt.RoomId = v_RoomId))
            AND ((bt.StartTime AT TIME ZONE v_TimeZoneId)::time < p_StartTime OR (bt.EndTime AT TIME ZONE v_TimeZoneId)::time > p_EndTime)
    ) THEN
        RAISE EXCEPTION 'Cannot change this shift -- a booking already exists outside the new time window.' USING ERRCODE = '50032';
    END IF;

    UPDATE public.ShiftAssignments
    SET StartTime = p_StartTime, EndTime = p_EndTime, UpdatedBy = p_UpdatedBy, UpdatedDate = now()
    WHERE Id = p_Id AND IsDelete = FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasShiftBookings(p_ShiftId int)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.ShiftAssignments sa
            JOIN public.Locations loc ON loc.Id = sa.LocationId
        JOIN public.BookingTreatments bt ON (bt.RoomId = sa.RoomId OR bt.TherapistId = sa.TherapistId)
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date = sa.WorkDate
            AND bt.IsDelete = FALSE
        JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        WHERE sa.Id = p_ShiftId AND sa.IsDelete = FALSE
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
    );
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasRoomBookings(p_RoomId int, p_WorkDate date)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        JOIN public.Rooms r ON r.Id = p_RoomId
        JOIN public.Locations loc ON loc.Id = r.LocationId
        WHERE bt.RoomId = p_RoomId
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date = p_WorkDate
            AND bt.IsDelete = FALSE
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
    );
$$;

CREATE OR REPLACE FUNCTION public.sp_Scheduling_HasBookingOverlap(p_RoomId int, p_WorkDate date, p_StartTime time, p_EndTime time)
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.BookingTreatments bt
        JOIN public.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = FALSE
        JOIN public.Rooms r ON r.Id = p_RoomId
        JOIN public.Locations loc ON loc.Id = r.LocationId
        WHERE bt.RoomId = p_RoomId
            AND bt.StartTime IS NOT NULL AND (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date = p_WorkDate
            AND bt.IsDelete = FALSE
            AND (bt.StartTime AT TIME ZONE loc.TimeZoneId)::time < p_EndTime AND (bt.EndTime AT TIME ZONE loc.TimeZoneId)::time > p_StartTime
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > now()))
    );
$$;

-- 7) sp_Staff_GetUnattendedPreBookingAlerts: per-row venue-local date instead of one global
-- precomputed v_Today. The original standalone "is bt.StartTime today (UTC)" filter is dropped --
-- it's already implied by (and was the same buggy UTC-day shape as) the EXTRACT(EPOCH...) lead-time
-- window, which is a pure UTC-instant-to-UTC-instant comparison needing no timezone resolution.
CREATE OR REPLACE FUNCTION public.sp_Staff_GetUnattendedPreBookingAlerts()
RETURNS TABLE(BookingId int, LocationId int, LocationName varchar, BookingTreatmentId int, TreatmentName varchar,
              StartTime timestamptz, EndTime timestamptz, TherapistId int, AssignedStaffName varchar,
              AssignedStaffEmail varchar, CustomerName varchar, LeadTimeMinutes int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_Now timestamptz := now();
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
        JOIN public.TherapistProfile tp ON tp.Id = bt.TherapistId
        LEFT JOIN public.Users u ON u.Id = tp.UserId
        JOIN public.Users cust ON cust.Id = b.CustomerId
        LEFT JOIN public.StaffAttendance sa
            ON sa.LocationId = b.LocationId AND sa.UserId = tp.UserId
                AND sa.WorkDate = (bt.StartTime AT TIME ZONE loc.TimeZoneId)::date AND sa.ArrivalTime IS NOT NULL
    WHERE bt.IsDelete = FALSE
      AND bt.ProxyTherapistId IS NULL
      AND sa.Id IS NULL
      AND EXTRACT(EPOCH FROM (bt.StartTime - v_Now)) / 60 BETWEEN 0 AND COALESCE(loc.StaffEarlyArrivalMinutes, chain.StaffEarlyArrivalMinutes, 30);
END;
$$;

-- 8) fn_Booking_ConfirmationHeader: add TimeZoneId so confirmation/cancellation emails can be
-- rendered venue-local. RETURNS TABLE column list changed -- DROP first (Postgres won't
-- CREATE OR REPLACE across that).
DROP FUNCTION IF EXISTS public.fn_Booking_ConfirmationHeader(int);
CREATE FUNCTION public.fn_Booking_ConfirmationHeader(p_BookingId int)
RETURNS TABLE(Id int, LocationId int, LocationName varchar, CustomerId int, CustomerName varchar, CustomerEmail varchar, TimeZoneId varchar)
LANGUAGE sql STABLE AS $$
    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.CustomerId, c.Name AS CustomerName, c.Email AS CustomerEmail, l.TimeZoneId
    FROM public.Bookings b
        JOIN public.Users c ON c.Id = b.CustomerId
        JOIN public.Locations l ON l.Id = b.LocationId
    WHERE b.Id = p_BookingId AND b.IsDelete = FALSE;
$$;
