-- 010_booking_details_timezone_tag.sql
-- fn_Booking_GetByIdHeader (GET /api/booking/{id}, backing the client portal's whole booking wizard
-- -- ScheduleStep/SlotPicker/TreatmentBar/SummaryStep) now returns the booking's own location
-- TimeZoneId. The client portal's schedule/slot-picker screens are switching from converting every
-- slot instant to the CUSTOMER's browser zone (via `new Date(iso).toLocaleTimeString()`) to
-- rendering it in the LOCATION's own zone instead, matching the admin panel's policy set in
-- 009_dashboard_upcoming_timezone_tag.sql -- no client-side guessing, one unambiguous reading of
-- "when this actually happens at that venue" no matter whose browser is looking at it.
-- RETURNS TABLE column list changed -- DROP first (Postgres won't CREATE OR REPLACE across that;
-- see 005/007/008/009 for the same situation).
SET search_path TO public;

DROP FUNCTION IF EXISTS public.fn_Booking_GetByIdHeader(int, int);
CREATE FUNCTION public.fn_Booking_GetByIdHeader(p_BookingId int, p_CustomerId int)
RETURNS TABLE(Id int, LocationId int, LocationName varchar, Status varchar, TimeZoneId varchar)
LANGUAGE sql STABLE AS $$
    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.Status, l.TimeZoneId
    FROM public.Bookings b
        JOIN public.Locations l ON l.Id = b.LocationId
    WHERE b.Id = p_BookingId AND b.CustomerId = p_CustomerId AND b.IsDelete = FALSE;
$$;
