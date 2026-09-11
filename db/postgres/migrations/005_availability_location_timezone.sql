-- 005_availability_location_timezone.sql
-- GetAvailableSlotsAsync/GetAvailableDatesAsync built slot times as naive Kind=Unspecified values
-- straight off Locations.OpenTime/CloseTime, with no timezone conversion at all -- only correct
-- while the venue's own TimeZoneId happens to be 'UTC'. For any other venue, the frontend displayed
-- (and re-posted) a slot that wasn't actually the venue's real open hours in UTC, so a genuinely
-- in-hours slot could round-trip into sp_Booking_ValidateSlotEligibility as out-of-hours (ERRCODE
-- 50038) once BookingService.ScheduleTreatmentAsync converted it via the caller's own X-Timezone.
--
-- Fix (paired with a BookingService.cs change, not in this file): compute slots as real UTC
-- instants using the venue's own TimeZoneId, so the value the client displays (via
-- `new Date(iso).toLocaleTimeString()`, already timezone-aware) and re-posts is unambiguous
-- regardless of the customer's own browser zone. This migration is the DB half: exposes
-- Locations.TimeZoneId through the two location-hours read functions so BookingService can do that
-- conversion. Postgres won't CREATE OR REPLACE a function whose RETURNS TABLE column list changed,
-- hence the DROP first.
SET search_path TO public;

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
