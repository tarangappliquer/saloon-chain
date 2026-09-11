-- 006_booking_cancel_window_bypass.sql
-- sp_Booking_Cancel unconditionally enforced the 48h cancellation window, duplicating (as a
-- defense-in-depth safety net) the same check BookingService.CancelAsync already made in C#. That
-- C# check now skips the window for (a) staff cancelling on a customer's behalf via emulation, and
-- (b) a booking with no succeeded payment -- but this SQL-side copy didn't know either, so it would
-- still reject those cancellations even after the C# gate let them through.
--
-- Add p_BypassCancellationWindow (set by BookingRepository from ICurrentUser.EmulatedByUserId --
-- SQL has no visibility into emulation state on its own) and have the function determine "unpaid"
-- itself from public.Payments, matching the same policy at both layers.
SET search_path TO public;

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
