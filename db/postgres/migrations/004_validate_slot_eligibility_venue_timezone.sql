-- 004_validate_slot_eligibility_venue_timezone.sql
-- sp_Booking_ValidateSlotEligibility derived WorkDate/StartTod/EndTod via `p_StartTime AT TIME ZONE
-- 'utc'`, then compared that straight against Locations.OpenTime/CloseTime, LocationDaySchedule,
-- RoomCategoryAssignments.WorkDate and ShiftAssignments.WorkDate/StartTime/EndTime -- all of which
-- are venue-local wall-clock values (per Locations.TimeZoneId), while p_StartTime/p_EndTime are true
-- UTC instants (BookingService.ScheduleTreatmentAsync converts the posted wall-clock to UTC before
-- calling in). For any location whose TimeZoneId isn't UTC, that mismatch shifts the derived
-- time-of-day by the venue's own offset, so a slot genuinely within business hours could still fail
-- the ERRCODE 50038 "Location is not open at the requested time" check (and, near midnight venue-
-- local, land RoomCategoryAssignments/ShiftAssignments lookups on the wrong calendar date).
--
-- Resolve the location's TimeZoneId first, then derive WorkDate/day-bit/time-of-day via
-- `AT TIME ZONE` that zone instead of a hardcoded 'utc', matching how the rest of the app already
-- treats venue-local business-hours data (see BookingService.IsWithinCancellationWindow).
SET search_path TO public;

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
