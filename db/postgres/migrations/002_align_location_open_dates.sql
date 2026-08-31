-- 002_align_location_open_dates.sql
-- sp_Booking_GetLocationOpenDates previously required BOTH an explicit RoomCategoryAssignments row
-- AND an explicit ShiftAssignments row for a date. That is stricter than the actual slot engine
-- (fn_Booking_AvailabilityRangeEligiblePairs), which also treats a "floating" therapist (no shift
-- assignments anywhere) as available every date, and -- when a location has no RCA rows at all --
-- treats every active room as open. The mismatch made BookingService.GetAvailableDatesAsync hide
-- dates from the client date picker that would in fact yield bookable slots.
--
-- This realigns the proc with the engine's room + shift eligibility (treatment-category filtering
-- stays out -- it isn't known at date-picker time; weekly-mask / holiday / IsClosed filtering
-- stays in the C# caller).
SET search_path TO public;

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
        SELECT d.WorkDate, r.RoomId, rca.ShiftType
        FROM dates d
            CROSS JOIN active_rooms r
            JOIN public.RoomCategoryAssignments rca
                ON rca.RoomId = r.RoomId AND rca.WorkDate = d.WorkDate
                AND rca.IsDelete = FALSE AND rca.IsActive = TRUE

        UNION ALL

        SELECT d.WorkDate, r.RoomId, 'FullDay'::varchar AS ShiftType
        FROM dates d
            CROSS JOIN active_rooms r
            CROSS JOIN location_has_rca lhr
        WHERE lhr.has_rca = FALSE
    ),
    eligible_shifts AS (
        SELECT sa.WorkDate, sa.RoomId, sa.ShiftType
        FROM public.ShiftAssignments sa
            JOIN public.TherapistProfile tp ON tp.Id = sa.TherapistId
                AND tp.IsDelete = FALSE AND tp.IsActive = TRUE
        WHERE sa.LocationId = p_LocationId
            AND sa.WorkDate BETWEEN p_FromDate AND p_ToDate
            AND sa.IsDelete = FALSE AND sa.IsActive = TRUE

        UNION ALL

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
