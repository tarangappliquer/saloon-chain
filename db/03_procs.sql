-- QUOTED_IDENTIFIER/ANSI_NULLS are baked into each object's metadata at CREATE time, not read from
-- the caller's session at execution time -- any tool whose default differs from ON (sqlcmd defaults
-- to OFF) silently miscompiles every proc in this file, breaking ones that touch tables with
-- filtered indexes/computed columns (e.g. dbo.Payments) with error 1934. Must stay the first
-- statement in this file.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetChains
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, BreakStartTime, BreakEndTime
    FROM dbo.SaloonChains
    WHERE IsDelete = 0 AND IsActive = 1
    ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetLocations
    @ChainId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT l.Id, l.ChainId, l.Name, l.Address, l.OpenTime, l.CloseTime,
           COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask, l.TimeZoneId
    FROM dbo.Locations l
        JOIN dbo.SaloonChains c ON c.Id = l.ChainId
    WHERE l.ChainId = @ChainId AND l.IsDelete = 0 AND l.IsActive = 1
    ORDER BY l.Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetLocationHolidays
    @LocationId INT,
    @FromDate   DATE,
    @ToDate     DATE
AS
BEGIN
    SET NOCOUNT ON;
    SELECT HolidayDate, Reason
    FROM dbo.LocationHolidays
    WHERE LocationId = @LocationId AND HolidayDate BETWEEN @FromDate AND @ToDate
        AND IsDelete = 0 AND IsActive = 1
    ORDER BY HolidayDate;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetTreatments
    @LocationId INT,
    @CategoryId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.Id, t.CategoryId, tc.Name AS CategoryName, t.Name, cp.Price, t.DurationSlots
    FROM dbo.Treatments t
        JOIN dbo.TreatmentCategories tc ON tc.Id = t.CategoryId
        CROSS APPLY (
            SELECT TOP 1 tp.Price
            FROM dbo.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= CAST(GETUTCDATE() AS DATE) AND tp.IsDelete = 0
            ORDER BY tp.EffectiveFrom DESC
        ) cp
    WHERE t.LocationId = @LocationId AND t.IsDelete = 0 AND t.IsActive = 1
        AND t.EffectiveFrom <= CAST(GETUTCDATE() AS DATE)
        AND tc.IsDelete = 0 AND tc.IsActive = 1
        AND (@CategoryId IS NULL OR t.CategoryId = @CategoryId)
    ORDER BY tc.Name, t.Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetAvailabilityData
    @LocationId        INT,
    @TreatmentIds      dbo.IntIdList READONLY,
    @WorkDate          DATE,
    @ExcludeBookingId  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1) location hours (+ explicit holiday flag, independent of whether shifts happen to exist that day)
    SELECT l.OpenTime, l.CloseTime,
           COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask,
        CASE WHEN EXISTS (
               SELECT 1
        FROM dbo.LocationHolidays h
        WHERE h.LocationId = l.Id AND h.HolidayDate = @WorkDate AND h.IsDelete = 0 AND h.IsActive = 1
           ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsHoliday
    FROM dbo.Locations l
        JOIN dbo.SaloonChains c ON c.Id = l.ChainId
    WHERE l.Id = @LocationId AND l.IsDelete = 0 AND l.IsActive = 1;

    -- 2) requested treatments (duration/category/price) as offered at this location
    SELECT t.Id, t.CategoryId, t.DurationSlots, cp.Price
    FROM dbo.Treatments t
        JOIN @TreatmentIds ti ON ti.Id = t.Id
        CROSS APPLY (
            SELECT TOP 1 tp.Price
            FROM dbo.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= CAST(GETUTCDATE() AS DATE) AND tp.IsDelete = 0
            ORDER BY tp.EffectiveFrom DESC
        ) cp
    WHERE t.LocationId = @LocationId AND t.IsDelete = 0 AND t.IsActive = 1
        AND t.EffectiveFrom <= CAST(GETUTCDATE() AS DATE);

    -- 3) eligible room/therapist pairs for the date, for the category of the requested treatments
    WITH
        Loc
        AS
        (
            SELECT OpenTime, CloseTime
            FROM dbo.Locations
            WHERE Id = @LocationId AND IsDelete = 0 AND IsActive = 1
        ),
        TargetCategories
        AS
        (
            SELECT DISTINCT t.CategoryId
            FROM dbo.Treatments t
                JOIN @TreatmentIds ti ON ti.Id = t.Id
            WHERE t.LocationId = @LocationId AND t.IsDelete = 0 AND t.IsActive = 1
        ),
        ActiveRooms
        AS
        (
            SELECT r.Id AS RoomId
            FROM dbo.Rooms r
            WHERE r.LocationId = @LocationId AND r.IsDelete = 0 AND r.IsActive = 1
        ),
        EligibleRooms
        AS
        (
                            SELECT r.RoomId, rca.ShiftType
                FROM ActiveRooms r
                    JOIN dbo.RoomCategoryAssignments rca ON rca.RoomId = r.RoomId AND rca.WorkDate = @WorkDate AND rca.IsDelete = 0 AND rca.IsActive = 1
                WHERE rca.TreatmentCategoryId IN (SELECT CategoryId
                FROM TargetCategories)

            UNION ALL

                SELECT r.RoomId, 'FullDay' AS ShiftType
                FROM ActiveRooms r
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM dbo.RoomCategoryAssignments rca2
                        JOIN dbo.Rooms r2 ON r2.Id = rca2.RoomId
                    WHERE r2.LocationId = @LocationId AND rca2.IsDelete = 0 AND rca2.IsActive = 1
                )
        ),
        EligibleShifts
        AS
        (
                            SELECT sa.RoomId, sa.TherapistId, sa.ShiftType, sa.StartTime AS ShiftStart, sa.EndTime AS ShiftEnd
                FROM dbo.ShiftAssignments sa
                WHERE sa.LocationId = @LocationId AND sa.WorkDate = @WorkDate AND sa.IsDelete = 0 AND sa.IsActive = 1

            UNION ALL

                SELECT CAST(NULL AS INT) AS RoomId, tp.Id AS TherapistId, 'FullDay' AS ShiftType, l.OpenTime AS ShiftStart, l.CloseTime AS ShiftEnd
                FROM dbo.TherapistProfile tp
        CROSS JOIN Loc l
                WHERE tp.IsDelete = 0 AND tp.IsActive = 1
                    AND (tp.LocationId = @LocationId OR tp.LocationId IS NULL)
                    AND NOT EXISTS (
                        SELECT 1
                        FROM dbo.ShiftAssignments sa2
                        WHERE sa2.TherapistId = tp.Id AND sa2.WorkDate = @WorkDate AND sa2.IsDelete = 0 AND sa2.IsActive = 1
                    )
        )
    -- es.RoomId IS NULL covers legacy/no-shift-assignment rows (works any room); a shift explicitly
    -- assigned to a room (the normal case now) only pairs with that same room.
    SELECT DISTINCT er.RoomId, es.TherapistId, es.ShiftType, es.ShiftStart, es.ShiftEnd
    FROM EligibleRooms er
        JOIN EligibleShifts es
        ON (es.ShiftType = er.ShiftType OR er.ShiftType = 'FullDay' OR es.ShiftType = 'FullDay')
            AND (es.RoomId IS NULL OR es.RoomId = er.RoomId);

    -- 4) scheduled treatment lines that day, anywhere -- NOT scoped to this location. NOLOCK:
    -- measured this read genuinely blocking (~2.5s) behind a concurrent sp_Booking_ScheduleTreatment
    -- UPDATE on this same table under default locking (RCSI is off on this DB) -- this is a
    -- read-mostly availability list, not the correctness gate (that's ScheduleTreatment's applock +
    -- its own re-check inside the write transaction), so a dirty read here is an acceptable trade.
    SELECT bt.RoomId, bt.TherapistId, bt.StartTime, bt.EndTime, b.Status
    FROM dbo.BookingTreatments bt WITH (NOLOCK)
        JOIN dbo.Bookings b WITH (NOLOCK) ON b.Id = bt.BookingId
    WHERE bt.StartTime IS NOT NULL AND CAST(bt.StartTime AS DATE) = @WorkDate
        AND bt.IsDelete = 0 AND b.IsDelete = 0
        AND (@ExcludeBookingId IS NULL OR b.Id <> @ExcludeBookingId)
        AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > SYSUTCDATETIME()));

    -- 5) admin-blocked room/time ranges that day (lunch break, therapist leave, etc) -- excluded from
    -- availability the same as a hard-conflicting booking, see SlotCalculator.ComputeAvailableSlots.
    SELECT bs.RoomId, bs.StartTime, bs.EndTime
    FROM dbo.BlockedSlots bs
        JOIN dbo.Rooms r ON r.Id = bs.RoomId
    WHERE r.LocationId = @LocationId AND bs.WorkDate = @WorkDate AND bs.IsDelete = 0;
END
GO

-- Range-aware sibling of sp_Booking_GetAvailabilityData: same eligibility rules (room/therapist
-- shift assignments, existing bookings), evaluated for every date in [@FromDate, @ToDate] via a
-- generated date spine instead of one @WorkDate. Used by BookingService.GetAvailableDatesAsync to
-- resolve a whole date range's per-day availability in one round trip instead of one per candidate
-- day. sp_Booking_GetAvailabilityData itself is unchanged and still backs the single-date
-- /api/booking/available-slots lookup.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetAvailabilityDataRange
    @LocationId        INT,
    @TreatmentIds      dbo.IntIdList READONLY,
    @FromDate          DATE,
    @ToDate            DATE,
    @ExcludeBookingId  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1) location hours -- date-independent, so no per-date holiday flag here (callers already
    -- resolve holiday dates for the whole range separately -- see CatalogRepository.GetHolidayDatesAsync).
    SELECT l.OpenTime, l.CloseTime,
           COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask
    FROM dbo.Locations l
        JOIN dbo.SaloonChains c ON c.Id = l.ChainId
    WHERE l.Id = @LocationId AND l.IsDelete = 0 AND l.IsActive = 1;

    -- 2) requested treatments (duration/category/price) -- same for every date in the range
    SELECT t.Id, t.CategoryId, t.DurationSlots, cp.Price
    FROM dbo.Treatments t
        JOIN @TreatmentIds ti ON ti.Id = t.Id
        CROSS APPLY (
            SELECT TOP 1 tp.Price
            FROM dbo.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= CAST(GETUTCDATE() AS DATE) AND tp.IsDelete = 0
            ORDER BY tp.EffectiveFrom DESC
        ) cp
    WHERE t.LocationId = @LocationId AND t.IsDelete = 0 AND t.IsActive = 1
        AND t.EffectiveFrom <= CAST(GETUTCDATE() AS DATE);

    -- 3) eligible room/therapist pairs for every date in range -- same rules as the single-date
    -- version, just joined against a generated date spine instead of one @WorkDate.
    ;WITH Dates AS (
        SELECT @FromDate AS WorkDate
        UNION ALL
        SELECT DATEADD(DAY, 1, WorkDate) FROM Dates WHERE WorkDate < @ToDate
    ),
    Loc AS (
        SELECT OpenTime, CloseTime
        FROM dbo.Locations
        WHERE Id = @LocationId AND IsDelete = 0 AND IsActive = 1
    ),
    TargetCategories AS (
        SELECT DISTINCT t.CategoryId
        FROM dbo.Treatments t
            JOIN @TreatmentIds ti ON ti.Id = t.Id
        WHERE t.LocationId = @LocationId AND t.IsDelete = 0 AND t.IsActive = 1
    ),
    ActiveRooms AS (
        SELECT r.Id AS RoomId
        FROM dbo.Rooms r
        WHERE r.LocationId = @LocationId AND r.IsDelete = 0 AND r.IsActive = 1
    ),
    EligibleRooms AS (
                        SELECT d.WorkDate, r.RoomId, rca.ShiftType
            FROM Dates d
                CROSS JOIN ActiveRooms r
                JOIN dbo.RoomCategoryAssignments rca ON rca.RoomId = r.RoomId AND rca.WorkDate = d.WorkDate AND rca.IsDelete = 0 AND rca.IsActive = 1
            WHERE rca.TreatmentCategoryId IN (SELECT CategoryId
            FROM TargetCategories)

        UNION ALL

            SELECT d.WorkDate, r.RoomId, 'FullDay' AS ShiftType
            FROM Dates d
                CROSS JOIN ActiveRooms r
            WHERE NOT EXISTS (
                SELECT 1
                FROM dbo.RoomCategoryAssignments rca2
                    JOIN dbo.Rooms r2 ON r2.Id = rca2.RoomId
                WHERE r2.LocationId = @LocationId AND rca2.IsDelete = 0 AND rca2.IsActive = 1
            )
    ),
    EligibleShifts AS (
                        SELECT sa.WorkDate, sa.RoomId, sa.TherapistId, sa.ShiftType, sa.StartTime AS ShiftStart, sa.EndTime AS ShiftEnd
            FROM dbo.ShiftAssignments sa
            WHERE sa.LocationId = @LocationId AND sa.WorkDate BETWEEN @FromDate AND @ToDate AND sa.IsDelete = 0 AND sa.IsActive = 1

        UNION ALL

            SELECT d.WorkDate, CAST(NULL AS INT) AS RoomId, tp.Id AS TherapistId, 'FullDay' AS ShiftType, l.OpenTime AS ShiftStart, l.CloseTime AS ShiftEnd
            FROM Dates d
                CROSS JOIN dbo.TherapistProfile tp
                CROSS JOIN Loc l
            WHERE tp.IsDelete = 0 AND tp.IsActive = 1
                AND (tp.LocationId = @LocationId OR tp.LocationId IS NULL)
                AND NOT EXISTS (
                    SELECT 1
                    FROM dbo.ShiftAssignments sa2
                    WHERE sa2.TherapistId = tp.Id AND sa2.WorkDate = d.WorkDate AND sa2.IsDelete = 0 AND sa2.IsActive = 1
                )
    )
    -- es.RoomId IS NULL covers legacy/no-shift-assignment rows (works any room); a shift explicitly
    -- assigned to a room (the normal case now) only pairs with that same room.
    SELECT DISTINCT er.WorkDate, er.RoomId, es.TherapistId, es.ShiftType, es.ShiftStart, es.ShiftEnd
    FROM EligibleRooms er
        JOIN EligibleShifts es
        ON es.WorkDate = er.WorkDate
            AND (es.ShiftType = er.ShiftType OR er.ShiftType = 'FullDay' OR es.ShiftType = 'FullDay')
            AND (es.RoomId IS NULL OR es.RoomId = er.RoomId)
    OPTION (MAXRECURSION 366);

    -- 4) scheduled treatment lines across the whole range, anywhere -- NOT scoped to this location.
    -- NOLOCK: see the matching comment in sp_Booking_GetAvailabilityData -- same table, same
    -- measured blocking behind a concurrent ScheduleTreatment write, same reasoning.
    SELECT bt.RoomId, bt.TherapistId, bt.StartTime, bt.EndTime, b.Status
    FROM dbo.BookingTreatments bt WITH (NOLOCK)
        JOIN dbo.Bookings b WITH (NOLOCK) ON b.Id = bt.BookingId
    WHERE bt.StartTime IS NOT NULL AND CAST(bt.StartTime AS DATE) BETWEEN @FromDate AND @ToDate
        AND bt.IsDelete = 0 AND b.IsDelete = 0
        AND (@ExcludeBookingId IS NULL OR b.Id <> @ExcludeBookingId)
        AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > SYSUTCDATETIME()));

    -- 5) admin-blocked room/time ranges across the whole range -- same reasoning as
    -- sp_Booking_GetAvailabilityData's blocked-slots result set above.
    SELECT bs.WorkDate, bs.RoomId, bs.StartTime, bs.EndTime
    FROM dbo.BlockedSlots bs
        JOIN dbo.Rooms r ON r.Id = bs.RoomId
    WHERE r.LocationId = @LocationId AND bs.WorkDate BETWEEN @FromDate AND @ToDate AND bs.IsDelete = 0;
END
GO

-- Creates the draft "cart" the moment treatments are picked, before any date/time exists --
-- 1 Bookings row (Status='Draft') + 1 unscheduled BookingTreatments row per treatment. No
-- room/therapist/time yet, so no lock/conflict-check needed here (that only matters once a
-- specific slot is claimed -- see sp_Booking_ScheduleTreatment below).
CREATE OR ALTER PROCEDURE dbo.sp_Booking_HasLocationRoomOpenings
    @LocationId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.RoomCategoryAssignments rca
            JOIN dbo.Rooms r ON r.Id = rca.RoomId
            JOIN dbo.ShiftAssignments sa ON sa.LocationId = @LocationId
                AND sa.WorkDate = rca.WorkDate
                AND (sa.ShiftType = rca.ShiftType OR sa.ShiftType = 'FullDay' OR rca.ShiftType = 'FullDay')
                AND (sa.RoomId IS NULL OR sa.RoomId = r.Id)
                AND sa.IsDelete = 0 AND sa.IsActive = 1
            JOIN dbo.TherapistProfile tp ON tp.Id = sa.TherapistId
                AND tp.IsDelete = 0 AND tp.IsActive = 1
        WHERE r.LocationId = @LocationId
          AND r.IsDelete = 0 AND r.IsActive = 1
          AND rca.IsDelete = 0 AND rca.IsActive = 1
    ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasRoomOpenings;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetLocationOpenDates
    @LocationId INT,
    @FromDate   DATE,
    @ToDate     DATE
AS
BEGIN
    SET NOCOUNT ON;
    SELECT DISTINCT rca.WorkDate
    FROM dbo.RoomCategoryAssignments rca
        JOIN dbo.Rooms r ON r.Id = rca.RoomId
        JOIN dbo.ShiftAssignments sa ON sa.LocationId = @LocationId
            AND sa.WorkDate = rca.WorkDate
            AND (sa.ShiftType = rca.ShiftType OR sa.ShiftType = 'FullDay' OR rca.ShiftType = 'FullDay')
            AND (sa.RoomId IS NULL OR sa.RoomId = r.Id)
            AND sa.IsDelete = 0 AND sa.IsActive = 1
        JOIN dbo.TherapistProfile tp ON tp.Id = sa.TherapistId
            AND tp.IsDelete = 0 AND tp.IsActive = 1
    WHERE r.LocationId = @LocationId
      AND r.IsDelete = 0 AND r.IsActive = 1
      AND rca.IsDelete = 0 AND rca.IsActive = 1
      AND rca.WorkDate BETWEEN @FromDate AND @ToDate
    ORDER BY rca.WorkDate;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_CreateDraft
    @LocationId   INT,
    @CustomerId   INT,
    @Treatments   dbo.IntIdList READONLY,
    @CreatedBy    INT = NULL,
    @BookingId    INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    INSERT INTO dbo.Bookings
        (LocationId, CustomerId, Status, CreatedBy)
    VALUES
        (@LocationId, @CustomerId, 'Draft', @CreatedBy);

    SET @BookingId = SCOPE_IDENTITY();

    INSERT INTO dbo.BookingTreatments
        (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, TreatmentPriceId, CreatedBy)
    SELECT @BookingId, t.Id, ROW_NUMBER() OVER (ORDER BY t.Id), t.DurationSlots, cp.Price, cp.Id, @CreatedBy
    FROM dbo.Treatments t
        JOIN @Treatments ti ON ti.Id = t.Id
        CROSS APPLY (
            SELECT TOP 1 tp.Id, tp.Price
            FROM dbo.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= CAST(GETUTCDATE() AS DATE) AND tp.IsDelete = 0
            ORDER BY tp.EffectiveFrom DESC
        ) cp
    WHERE t.LocationId = @LocationId AND t.IsDelete = 0 AND t.IsActive = 1
        AND t.EffectiveFrom <= CAST(GETUTCDATE() AS DATE);

    COMMIT TRANSACTION;
END
GO

-- Adds one more (unscheduled) treatment line to an existing draft -- the "add treatment" action
-- from any step of the wizard. Only allowed while the booking is still a Draft the caller owns.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_AddTreatment
    @BookingId   INT,
    @CustomerId  INT,
    @TreatmentId INT,
    @CreatedBy   INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @LocationId INT, @NextSeq SMALLINT;

    SELECT @LocationId = LocationId
    FROM dbo.Bookings
    WHERE Id = @BookingId AND CustomerId = @CustomerId AND IsDelete = 0 AND Status = 'Draft';

    IF @LocationId IS NULL
        THROW 50005, 'Booking not found or not editable.', 1;

    SELECT @NextSeq = COALESCE(MAX(SequenceOrder), 0) + 1
    FROM dbo.BookingTreatments
    WHERE BookingId = @BookingId;

    INSERT INTO dbo.BookingTreatments
        (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, TreatmentPriceId, CreatedBy)
    SELECT @BookingId, t.Id, @NextSeq, t.DurationSlots, cp.Price, cp.Id, @CreatedBy
    FROM dbo.Treatments t
        CROSS APPLY (
            SELECT TOP 1 tp.Id, tp.Price
            FROM dbo.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= CAST(GETUTCDATE() AS DATE) AND tp.IsDelete = 0
            ORDER BY tp.EffectiveFrom DESC
        ) cp
    WHERE t.Id = @TreatmentId AND t.LocationId = @LocationId AND t.IsDelete = 0 AND t.IsActive = 1
        AND t.EffectiveFrom <= CAST(GETUTCDATE() AS DATE);

    IF @@ROWCOUNT = 0
        THROW 50006, 'Treatment not available at this location.', 1;

    UPDATE dbo.Bookings SET UpdatedDate = SYSUTCDATETIME(), UpdatedBy = @CreatedBy WHERE Id = @BookingId;
END
GO

-- Removes one treatment line from a draft (soft-delete) -- frees whatever slot it held, if any,
-- since the availability query only ever reads non-deleted lines. Returns the freed
-- (location,room,date) if the line was actually scheduled, so the API can invalidate the
-- availability cache/SSE for it -- zero rows if it hadn't been scheduled yet.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_RemoveTreatment
    @BookingId   INT,
    @CustomerId  INT,
    @TreatmentId INT,
    @UpdatedBy   INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Removed TABLE (LocationId INT,
        RoomId INT,
        StartTime DATETIME2);

    UPDATE bt
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    OUTPUT b.LocationId, deleted.RoomId, deleted.StartTime INTO @Removed
    FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = @BookingId AND bt.TreatmentId = @TreatmentId AND bt.IsDelete = 0
        AND b.CustomerId = @CustomerId AND b.IsDelete = 0 AND b.Status = 'Draft';

    IF @@ROWCOUNT = 0
        THROW 50007, 'Treatment not found on this booking.', 1;

    UPDATE dbo.Bookings SET UpdatedDate = SYSUTCDATETIME(), UpdatedBy = @UpdatedBy WHERE Id = @BookingId;

    SELECT LocationId, RoomId, CAST(StartTime AS DATE) AS WorkDate
    FROM @Removed
    WHERE RoomId IS NOT NULL;
END
GO

-- Correctness boundary: everything above is read-only advisory data for the API to compute
-- candidate slots from. This proc re-validates under an app lock before writing, so a stale
-- read (or a race between two customers) can never produce a double-booking.
--
-- Two locks, not one: the conflict check below considers a match on RoomId *or* TherapistId, so
-- two holds that share a therapist but target different rooms (or vice versa) must still
-- serialize against each other. A single room-keyed lock only serializes same-room contention --
-- concurrent holds for the same therapist in two different rooms would take different lock keys,
-- both pass the EXISTS check against not-yet-committed data, and both insert. Always acquire the
-- room lock before the therapist lock (every caller, every time) so two transactions contending
-- on both resources can't deadlock by acquiring them in opposite orders.
--
-- Unlike the old per-treatment CreateHold, this UPDATEs the treatment's own existing
-- BookingTreatments row rather than inserting a new one -- there's always exactly one row per
-- (booking, treatment), scheduled or not. Re-picking a time is just scheduling the same row again,
-- so the conflict check explicitly excludes that row (it's about to be overwritten, not a real
-- conflict with itself).
CREATE OR ALTER PROCEDURE dbo.sp_Booking_ScheduleTreatment
    @BookingId   INT,
    @CustomerId  INT,
    @TreatmentId INT,
    @RoomId      INT,
    @TherapistId INT,
    @StartTime   DATETIME2,
    @EndTime     DATETIME2,
    @UpdatedBy   INT = NULL,
    @ExpiresAt   DATETIME2 OUTPUT,
    @LocationId  INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RoomLockKey NVARCHAR(100) = CONCAT('room_', @RoomId, '_', CONVERT(VARCHAR(10), @StartTime, 23));
    DECLARE @TherapistLockKey NVARCHAR(100) = CONCAT('therapist_', @TherapistId, '_', CONVERT(VARCHAR(10), @StartTime, 23));
    DECLARE @LockResult INT;

    BEGIN TRANSACTION;

    EXEC @LockResult = sp_getapplock @Resource = @RoomLockKey, @LockMode = 'Exclusive',
                                      @LockOwner = 'Transaction', @LockTimeout = 5000;
    IF @LockResult < 0
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50001, 'Could not acquire booking lock, try again.', 1;
    END

    EXEC @LockResult = sp_getapplock @Resource = @TherapistLockKey, @LockMode = 'Exclusive',
                                      @LockOwner = 'Transaction', @LockTimeout = 5000;
    IF @LockResult < 0
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50001, 'Could not acquire booking lock, try again.', 1;
    END

    SELECT TOP 1
        @LocationId = b.LocationId
    FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = @BookingId AND bt.TreatmentId = @TreatmentId AND bt.IsDelete = 0
        AND b.CustomerId = @CustomerId AND b.IsDelete = 0 AND b.Status = 'Draft';

    IF @LocationId IS NULL
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50008, 'Booking or treatment not found.', 1;
    END

    IF EXISTS (
        SELECT 1
    FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE (bt.RoomId = @RoomId OR bt.TherapistId = @TherapistId)
        AND bt.IsDelete = 0 AND b.IsDelete = 0
        AND NOT (bt.BookingId = @BookingId AND bt.TreatmentId = @TreatmentId)
        AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > SYSUTCDATETIME()))
        AND bt.StartTime < @EndTime AND bt.EndTime > @StartTime
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50002, 'Slot no longer available.', 1;
    END

    SET @ExpiresAt = DATEADD(MINUTE, 5, SYSUTCDATETIME());

    UPDATE dbo.BookingTreatments
    SET RoomId = @RoomId, TherapistId = @TherapistId, StartTime = @StartTime, EndTime = @EndTime,
        ExpiresAt = @ExpiresAt, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE BookingId = @BookingId AND TreatmentId = @TreatmentId AND IsDelete = 0;

    UPDATE dbo.Bookings SET UpdatedDate = SYSUTCDATETIME(), UpdatedBy = @UpdatedBy WHERE Id = @BookingId;

    COMMIT TRANSACTION;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_Delete
    @BookingId   INT,
    @CustomerId  INT = NULL,
    @UpdatedBy   INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    -- Delete child treatment entries for the booking (cascade delete target)
    DELETE FROM dbo.BookingTreatments WHERE BookingId = @BookingId;

    -- Delete child payment entries if any
    DELETE FROM dbo.Payments WHERE BookingId = @BookingId;

    -- Delete the main booking entry
    DELETE FROM dbo.Bookings WHERE Id = @BookingId AND (@CustomerId IS NULL OR CustomerId = @CustomerId);

    COMMIT TRANSACTION;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_Confirm
    @BookingId  INT,
    @CustomerId INT = NULL,
    @UpdatedBy  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM dbo.Bookings WHERE Id = @BookingId AND Status = 'Confirmed' AND IsDelete = 0
    )
    BEGIN
        SELECT b.LocationId, bt.RoomId, CAST(bt.StartTime AS DATE) AS WorkDate
        FROM dbo.BookingTreatments bt
            JOIN dbo.Bookings b ON b.Id = bt.BookingId
        WHERE bt.BookingId = @BookingId AND bt.IsDelete = 0;
        RETURN;
    END

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Bookings
        WHERE Id = @BookingId AND (@CustomerId IS NULL OR @CustomerId = 0 OR CustomerId = @CustomerId) AND IsDelete = 0 AND Status = 'Draft'
    )
        THROW 50003, 'Booking not found or already finalized.', 1;

    IF NOT EXISTS (SELECT 1
    FROM dbo.BookingTreatments
    WHERE BookingId = @BookingId AND IsDelete = 0)
        THROW 50003, 'Booking has no treatments.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.BookingTreatments
        WHERE BookingId = @BookingId AND IsDelete = 0
            AND StartTime IS NULL
    )
        THROW 50003, 'Every treatment needs a time before confirming.', 1;

    UPDATE dbo.Bookings
    SET Status = 'Confirmed', UpdatedBy = COALESCE(@UpdatedBy, @CustomerId), UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @BookingId;

    UPDATE dbo.BookingTreatments
    SET ExpiresAt = NULL, UpdatedBy = COALESCE(@UpdatedBy, @CustomerId), UpdatedDate = SYSUTCDATETIME()
    WHERE BookingId = @BookingId AND IsDelete = 0;

    SELECT b.LocationId, bt.RoomId, CAST(bt.StartTime AS DATE) AS WorkDate
    FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = @BookingId AND bt.IsDelete = 0;
END
GO

-- Backs the confirmation email (BookingService.ConfirmAsync, Shared/Email) -- separate from
-- sp_Booking_Confirm's own return value (just LocationId/RoomId/WorkDate per line, enough for
-- cache invalidation) because the email needs customer/location names and each treatment's own
-- therapist/time, which that lean shape deliberately doesn't carry.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetConfirmationDetails
    @BookingId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.Id, c.Name AS CustomerName, c.Email AS CustomerEmail, l.Name AS LocationName
    FROM dbo.Bookings b
        JOIN dbo.Users c ON c.Id = b.CustomerId
        JOIN dbo.Locations l ON l.Id = b.LocationId
    WHERE b.Id = @BookingId AND b.IsDelete = 0;

    SELECT bt.TreatmentId, t.Name AS TreatmentName, th.Name AS TherapistName,
        bt.StartTime, bt.EndTime, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt
        JOIN dbo.Treatments t ON t.Id = bt.TreatmentId
        JOIN dbo.TherapistProfile th ON th.Id = bt.TherapistId
    WHERE bt.BookingId = @BookingId AND bt.IsDelete = 0
    ORDER BY bt.SequenceOrder;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_Cancel
    @BookingId  INT,
    @CustomerId INT,
    @UpdatedBy  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Enforce 48-hour (2-day) cancellation policy
    DECLARE @EarliestStartTime DATETIME2;
    SELECT @EarliestStartTime = MIN(StartTime)
    FROM dbo.BookingTreatments
    WHERE BookingId = @BookingId AND IsDelete = 0 AND StartTime IS NOT NULL;

    IF @EarliestStartTime IS NOT NULL AND @EarliestStartTime <= DATEADD(HOUR, 48, SYSUTCDATETIME())
        THROW 50005, 'Bookings cannot be cancelled within 48 hours (2 days) of the appointment date.', 1;

    UPDATE dbo.Bookings
    SET Status = 'Cancelled', UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @BookingId AND CustomerId = @CustomerId AND IsDelete = 0
        AND Status IN ('Draft','Confirmed');

    IF @@ROWCOUNT = 0
        THROW 50004, 'Booking not found.', 1;

    SELECT b.LocationId, bt.RoomId, CAST(bt.StartTime AS DATE) AS WorkDate
    FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = @BookingId AND bt.IsDelete = 0 AND bt.StartTime IS NOT NULL;
END
GO

-- Called every ~30s by a background job -- no logged-in user in that context. Sweeps expired
-- treatment LINES back to unscheduled (NULLing their room/therapist/time/expiry) rather than
-- deleting them or touching the booking's Status -- the treatment stays in the draft, it just
-- needs re-picking. Returns the (location,room,date) tuples that freed up so the API can
-- invalidate the availability cache and nudge SSE subscribers for just those groups.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_ExpireStaleHolds
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Expired TABLE (LocationId INT,
        RoomId INT,
        WorkDate DATE);

    UPDATE bt
    SET RoomId = NULL, TherapistId = NULL, StartTime = NULL, EndTime = NULL, ExpiresAt = NULL,
        UpdatedDate = SYSUTCDATETIME()
    OUTPUT b.LocationId, deleted.RoomId, CAST(deleted.StartTime AS DATE) INTO @Expired
    FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE b.Status = 'Draft' AND bt.IsDelete = 0
        AND bt.ExpiresAt IS NOT NULL AND bt.ExpiresAt <= SYSUTCDATETIME();

    -- Delete unpaid payment records older than 30 minutes
    DELETE FROM dbo.Payments
    WHERE Status <> 'Succeeded'
        AND CreatedDate <= DATEADD(MINUTE, -30, SYSUTCDATETIME());

    -- Delete draft bookings inactive/unpaid for 30+ minutes from database
    DECLARE @StaleBookingIds TABLE (Id INT);

    INSERT INTO @StaleBookingIds
        (Id)
    SELECT Id
    FROM dbo.Bookings
    WHERE Status = 'Draft'
        AND COALESCE(UpdatedDate, CreatedDate) <= DATEADD(MINUTE, -30, SYSUTCDATETIME());

    DELETE FROM dbo.Payments WHERE BookingId IN (SELECT Id
    FROM @StaleBookingIds);
    DELETE FROM dbo.BookingTreatments WHERE BookingId IN (SELECT Id
    FROM @StaleBookingIds);
    DELETE FROM dbo.Bookings WHERE Id IN (SELECT Id
    FROM @StaleBookingIds);

    SELECT DISTINCT LocationId, RoomId, WorkDate
    FROM @Expired;
END
GO

-- Powers refresh-restore: the booking id lives in the URL, so a reload just re-fetches the
-- current state of the draft from here instead of trusting anything client-persisted.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetById
    @BookingId  INT,
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- NOLOCK: pure read outside any write transaction, powers refresh-restore -- same
    -- Bookings/BookingTreatments contention as the availability reads (see sp_Booking_GetAvailabilityData).
    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.Status
    FROM dbo.Bookings b WITH (NOLOCK)
        JOIN dbo.Locations l WITH (NOLOCK) ON l.Id = b.LocationId
    WHERE b.Id = @BookingId AND b.CustomerId = @CustomerId AND b.IsDelete = 0;

    SELECT bt.Id, bt.TreatmentId, t.Name AS TreatmentName, bt.RoomId, bt.TherapistId,
        th.Name AS TherapistName, bt.StartTime, bt.EndTime, bt.ExpiresAt, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt WITH (NOLOCK)
        JOIN dbo.Treatments t WITH (NOLOCK) ON t.Id = bt.TreatmentId
        LEFT JOIN dbo.TherapistProfile th WITH (NOLOCK) ON th.Id = bt.TherapistId
    WHERE bt.BookingId = @BookingId AND bt.IsDelete = 0
    ORDER BY bt.SequenceOrder;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetMine
    @CustomerId INT,
    @ChainId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- NOLOCK: pure read, same reasoning as sp_Booking_GetById above.
    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.Status, b.CreatedDate,
        p.Provider AS PaymentProvider, p.Status AS PaymentStatus
    FROM dbo.Bookings b WITH (NOLOCK)
        JOIN dbo.Locations l WITH (NOLOCK) ON l.Id = b.LocationId
        LEFT JOIN (
            SELECT BookingId, Provider, Status,
            ROW_NUMBER() OVER (PARTITION BY BookingId ORDER BY Id DESC) AS rn
        FROM dbo.Payments WITH (NOLOCK)
        ) p ON p.BookingId = b.Id AND p.rn = 1
    WHERE b.CustomerId = @CustomerId
        AND (@ChainId IS NULL OR l.ChainId = @ChainId)
        AND (b.Status IN ('Confirmed', 'Cancelled') OR (b.Status = 'Draft' AND COALESCE(b.UpdatedDate, b.CreatedDate) > DATEADD(MINUTE, -30, SYSUTCDATETIME())))
        AND b.IsDelete = 0
    ORDER BY b.Id DESC;

    SELECT bt.BookingId, bt.TreatmentId, t.Name AS TreatmentName, bt.TherapistId,
        th.Name AS TherapistName, bt.StartTime, bt.EndTime, bt.SequenceOrder, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt WITH (NOLOCK)
        JOIN dbo.Treatments t WITH (NOLOCK) ON t.Id = bt.TreatmentId
        JOIN dbo.Bookings b WITH (NOLOCK) ON b.Id = bt.BookingId
        JOIN dbo.Locations l WITH (NOLOCK) ON l.Id = b.LocationId
        LEFT JOIN dbo.TherapistProfile th WITH (NOLOCK) ON th.Id = bt.TherapistId
    WHERE b.CustomerId = @CustomerId
        AND (@ChainId IS NULL OR l.ChainId = @ChainId)
        AND (b.Status IN ('Confirmed', 'Cancelled') OR (b.Status = 'Draft' AND COALESCE(b.UpdatedDate, b.CreatedDate) > DATEADD(MINUTE, -15, SYSUTCDATETIME())))
        AND b.IsDelete = 0 AND bt.IsDelete = 0;
END
GO

-- Shared by self-registration (Role='Customer', @CreatedBy=NULL) and admin-created logins --
-- staff (Role='RootSuperAdmin'/'SuperAdmin'/'Admin'/'Manager'/'Receptionist'/'Therapist'/'Other')
-- or a Customer created on their behalf by RootSuperAdmin/SuperAdmin/Admin/Manager (@CreatedBy=the
-- creator's user id either way).
CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreateUser
    @Name             NVARCHAR(200),
    @Email            NVARCHAR(256),
    @PasswordHash     VARBINARY(256),
    @PasswordSalt     VARBINARY(128),
    @Phone            NVARCHAR(30) = NULL,
    @Role             VARCHAR(20) = 'Customer',
    @ChainId          INT = NULL,
    @LocationId       INT = NULL,
    @TherapistId      INT = NULL,
    @IsEmulator       BIT = 0,
    @CreatedBy        INT = NULL,
    -- NULL for self-registration (no logged-in user yet)
    -- True only for AdminSeeder's server-configured bootstrap account -- never for self-registration
    -- or admin-created staff/customers, who still go through the normal email-verification flow.
    @IsEmailVerified  BIT = 0,
    @UserId           INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1
    FROM dbo.Users
    WHERE Email = @Email AND IsDelete = 0)
        THROW 50010, 'Email already registered.', 1;

    -- Defense in depth alongside AdminStaffEndpoints' C#-side clamp -- IsEmulator only ever applies
    -- to RootSuperAdmin/SuperAdmin/Admin, same restriction as sp_Admin_UpdateUser below.
    INSERT INTO dbo.Users
        (Name, Email, PasswordHash, PasswordSalt, Phone, Role, ChainId, LocationId, TherapistId, IsEmulator, CreatedBy, IsEmailVerified)
    VALUES
        (
            @Name, @Email, @PasswordHash, @PasswordSalt, @Phone, @Role, @ChainId, @LocationId, @TherapistId,
            CASE WHEN @Role IN ('RootSuperAdmin', 'SuperAdmin', 'Admin') THEN @IsEmulator ELSE CAST(0 AS BIT) END,
            @CreatedBy, @IsEmailVerified);

    SET @UserId = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetUserByEmail
    @Email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.PasswordSalt, u.Role, u.ChainId, u.LocationId, u.TherapistId,
        u.IsEmulator, u.StripeCustomerId, COALESCE(sp.PhotoPath, u.ProfilePhoto) AS PhotoPath, u.IsEmailVerified
    FROM dbo.Users u
        LEFT JOIN dbo.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Email = @Email AND u.IsDelete = 0 AND u.IsActive = 1;
END
GO

-- Backs the emulation exchange (sp_Auth_EmulateCustomer is called from AuthService, not here directly):
-- looks up the emulating staff member (to check IsEmulator) and the target customer, both by id.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetUserById
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.PasswordSalt, u.Role, u.ChainId, u.LocationId, u.TherapistId,
        u.IsEmulator, u.StripeCustomerId, COALESCE(sp.PhotoPath, u.ProfilePhoto) AS PhotoPath, u.IsEmailVerified
    FROM dbo.Users u
        LEFT JOIN dbo.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Id = @Id AND u.IsDelete = 0 AND u.IsActive = 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreateRefreshToken
    @UserId    INT,
    @TokenHash VARBINARY(32),
    @ExpiresAt DATETIME2,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.RefreshTokens
        (UserId, TokenHash, ExpiresAt)
    VALUES
        (@UserId, @TokenHash, @ExpiresAt);

    SET @Id = SCOPE_IDENTITY();
END
GO

-- Backs both /api/auth/refresh (mint a new access token) and /api/auth/logout (revoke on sign-out) --
-- joins straight through to Users so AuthService can re-mint an access token from one round trip
-- without a second lookup. Caller (AuthService.RefreshAsync) is responsible for checking
-- ExpiresAt/RevokedDate before trusting the row.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetRefreshToken
    @TokenHash VARBINARY(32)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT rt.Id, rt.UserId, rt.ExpiresAt, rt.RevokedDate,
        u.Name, u.Email, u.Role, u.ChainId, u.LocationId, u.TherapistId, u.IsEmulator, u.IsEmailVerified
    FROM dbo.RefreshTokens rt
        JOIN dbo.Users u ON u.Id = rt.UserId
    WHERE rt.TokenHash = @TokenHash AND u.IsDelete = 0 AND u.IsActive = 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_RevokeRefreshToken
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RefreshTokens SET RevokedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND RevokedDate IS NULL;
END
GO

-- Called after a successful password reset -- a stolen/stale session shouldn't survive the owner
-- taking their account back. Same idempotent "only touch still-live rows" shape as the single-token
-- revoke above.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_RevokeAllRefreshTokens
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RefreshTokens SET RevokedDate = SYSUTCDATETIME()
    WHERE UserId = @UserId AND RevokedDate IS NULL;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreatePasswordResetToken
    @UserId    INT,
    @TokenHash VARBINARY(32),
    @ExpiresAt DATETIME2,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.PasswordResetTokens
        (UserId, TokenHash, ExpiresAt)
    VALUES
        (@UserId, @TokenHash, @ExpiresAt);

    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetPasswordResetToken
    @TokenHash VARBINARY(32)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT prt.Id, prt.UserId, prt.ExpiresAt, prt.ResetDate, u.Name, u.Email
    FROM dbo.PasswordResetTokens prt
        JOIN dbo.Users u ON u.Id = prt.UserId
    WHERE prt.TokenHash = @TokenHash AND u.IsDelete = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_ConsumePasswordResetToken
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.PasswordResetTokens SET ResetDate = SYSUTCDATETIME()
    WHERE Id = @Id AND ResetDate IS NULL;
END
GO

-- Self-service and admin-triggered password changes both land here -- deliberately narrow (just the
-- hash/salt), same "never touch Role/scope/IsActive from this path" discipline as sp_Profile_UpdateSelf.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_UpdatePassword
    @UserId       INT,
    @PasswordHash VARBINARY(256),
    @PasswordSalt VARBINARY(128)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users
    SET PasswordHash = @PasswordHash, PasswordSalt = @PasswordSalt, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @UserId AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50044, 'User not found.', 1;
END
GO

-- Self-service "change email" flow, same opaque/hashed/single-use pattern as the password-reset
-- token procs above. Rejects up front if another active account already holds @NewEmail -- the
-- confirm step below re-checks under a transaction since time (and other changes) may have passed
-- between request and click. @Id <> @UserId lets a caller re-request verification for their OWN
-- current (unverified) address -- see /api/profile/email/verify-request -- without tripping over
-- their own row.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreateEmailChangeToken
    @UserId    INT,
    @NewEmail  NVARCHAR(256),
    @TokenHash VARBINARY(32),
    @ExpiresAt DATETIME2,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @NewEmail AND IsDelete = 0 AND Id <> @UserId)
        THROW 50045, 'That email address is already in use.', 1;

    INSERT INTO dbo.EmailChangeTokens
        (UserId, NewEmail, TokenHash, ExpiresAt)
    VALUES
        (@UserId, @NewEmail, @TokenHash, @ExpiresAt);

    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetEmailChangeToken
    @TokenHash VARBINARY(32)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, UserId, NewEmail, ExpiresAt, ConfirmedDate
    FROM dbo.EmailChangeTokens
    WHERE TokenHash = @TokenHash;
END
GO

-- Applies the staged email once the link mailed to NewEmail is clicked. The uniqueness re-check and
-- the Users.Email update happen inside one transaction so a second account can't grab @NewEmail in
-- the gap between the check and the write.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_ConfirmEmailChange
    @Id       INT,
    @UserId   INT,
    @NewEmail NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @NewEmail AND IsDelete = 0 AND Id <> @UserId)
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50046, 'That email address is already in use.', 1;
    END

    UPDATE dbo.Users SET Email = @NewEmail, IsEmailVerified = 1, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @UserId AND IsDelete = 0;

    UPDATE dbo.EmailChangeTokens SET ConfirmedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND ConfirmedDate IS NULL;

    COMMIT TRANSACTION;
END
GO

-- Admin-portal CRUD + oversight procs. Run after 01-06. All writes take @CreatedBy/@UpdatedBy from
-- the calling admin's ICurrentUser -- never NULL here (unlike self-registration/system jobs),
-- because every admin action is behind [Authorize].

-------------------------------------------------------------------------------------------------
-- Staff (Users) management
-------------------------------------------------------------------------------------------------

-- @Role = NULL means "every staff role" (i.e. everyone except Role='Customer') -- this powers the
-- admin "Staff" screen, which has no business listing the customer base. Pass @Role explicitly
-- (including 'Customer') to bypass that default and filter to one specific role.
CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetUsers
    @Role       VARCHAR(20) = NULL,
    @ChainId    INT = NULL,
    @LocationId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Email, Phone, Role, ChainId, LocationId, TherapistId, IsEmulator, IsActive, CreatedDate
    FROM dbo.Users
    WHERE IsDelete = 0
        AND ((@Role IS NULL AND Role <> 'Customer') OR Role = @Role)
        AND (@ChainId IS NULL OR ChainId = @ChainId)
        AND (@LocationId IS NULL OR LocationId = @LocationId)
    ORDER BY Role, Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Admin_UpdateUser
    @Id          INT,
    @Name        NVARCHAR(200),
    @Phone       NVARCHAR(30) = NULL,
    @Role        VARCHAR(20) = NULL,
    @ChainId     INT = NULL,
    @LocationId  INT = NULL,
    @TherapistId INT = NULL,
    @IsEmulator  BIT = 0,
    @IsActive    BIT,
    @UpdatedBy   INT
AS
BEGIN
    SET NOCOUNT ON;
    -- AdminAccess keeps Customer rows out of this proc's caller, but that's a "which endpoint" gate,
    -- not a "which row" one -- nothing stops the request body itself from setting @IsEmulator=1 on
    -- a row this shouldn't apply to. Enforced here instead of trusting the caller: IsEmulator only
    -- ever applies to RootSuperAdmin/SuperAdmin/Admin (mirrors AuthService.EmulatorEligibleRoles and
    -- AdminStaffEndpoints' matching clamp), so login's CanEmulate and the emulate exchange's
    -- authorization stay consistent no matter what was requested.
    UPDATE dbo.Users
    SET Name = @Name, Phone = @Phone, Role = COALESCE(@Role, Role), ChainId = @ChainId, LocationId = @LocationId,
        TherapistId = @TherapistId,
        IsEmulator = CASE WHEN COALESCE(@Role, Role) IN ('RootSuperAdmin', 'SuperAdmin', 'Admin') THEN @IsEmulator ELSE 0 END,
        IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0 AND Role <> 'Customer';

    IF @@ROWCOUNT = 0
        THROW 50020, 'Staff user not found.', 1;
END
GO

-------------------------------------------------------------------------------------------------
-- Catalog: chains / locations / treatment categories / treatments
-- These sp_Admin_Get* reads exist alongside sp_Catalog_Get* (03_procs_catalog.sql) because the
-- public ones filter to IsActive=1 only and don't return the flag -- an admin managing the
-- catalog needs to see (and reactivate) inactive rows too.
-------------------------------------------------------------------------------------------------

-- @ChainId = NULL means "every chain" (SuperAdmin); pass it to scope the list down to a single
-- tenant (Admin -- see AdminCatalogEndpoints.MapGet("/chains")).
CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetChains
    @ChainId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, BreakStartTime, BreakEndTime, IsActive
    FROM dbo.SaloonChains
    WHERE IsDelete = 0 AND (@ChainId IS NULL OR Id = @ChainId)
    ORDER BY Name;
END
GO

-- @LocationId narrows to a single location (a Manager fetching their own location by
-- ICurrentUser.LocationId, no chain id available to them); @ChainId lists a whole chain as before.
CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetLocations
    @ChainId INT = NULL,
    @LocationId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT l.Id, l.ChainId, l.Name, l.Address, l.OpenTime, l.CloseTime,
           COALESCE(l.BreakStartTime, c.BreakStartTime) AS BreakStartTime,
           COALESCE(l.BreakEndTime, c.BreakEndTime) AS BreakEndTime,
           l.WorkingDaysMask, l.TimeZoneId, l.IsActive
    FROM dbo.Locations l
        JOIN dbo.SaloonChains c ON c.Id = l.ChainId
    WHERE l.IsDelete = 0
        AND (@ChainId IS NULL OR l.ChainId = @ChainId)
        AND (@LocationId IS NULL OR l.Id = @LocationId)
    ORDER BY l.Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetTreatments
    @LocationId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.Id, t.CategoryId, tc.Name AS CategoryName, t.Name, cp.Price, t.DurationSlots, t.EffectiveFrom, t.IsActive
    FROM dbo.Treatments t
        JOIN dbo.TreatmentCategories tc ON tc.Id = t.CategoryId
        OUTER APPLY (
            SELECT TOP 1 tp.Price
            FROM dbo.TreatmentPrices tp
            WHERE tp.TreatmentId = t.Id AND tp.EffectiveFrom <= CAST(GETUTCDATE() AS DATE) AND tp.IsDelete = 0
            ORDER BY tp.EffectiveFrom DESC
        ) cp
    WHERE t.LocationId = @LocationId AND t.IsDelete = 0
    ORDER BY tc.Name, t.Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateChain
    @Name           NVARCHAR(200),
    @BreakStartTime TIME = NULL,
    @BreakEndTime   TIME = NULL,
    @CreatedBy      INT,
    @Id             INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.SaloonChains
        (Name, BreakStartTime, BreakEndTime, CreatedBy)
    VALUES
        (@Name, @BreakStartTime, @BreakEndTime, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateChain
    @Id             INT,
    @Name           NVARCHAR(200),
    @BreakStartTime TIME = NULL,
    @BreakEndTime   TIME = NULL,
    @IsActive       BIT,
    @UpdatedBy      INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SaloonChains
    SET Name = @Name, BreakStartTime = @BreakStartTime, BreakEndTime = @BreakEndTime,
        IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50021, 'Chain not found.', 1;
END
GO

-- First real (soft-)delete in the app -- every table already carries IsDelete but nothing sets it
-- until now (see 01_tables.sql's audit-column comment). No cascade: a deleted chain's locations
-- keep IsDelete=0 and simply become unreachable through normal admin nav, same as deactivation.
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_DeleteChain
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SaloonChains
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50021, 'Chain not found.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateLocation
    @ChainId         INT,
    @Name            NVARCHAR(200),
    @Address         NVARCHAR(400) = NULL,
    @OpenTime        TIME,
    @CloseTime       TIME,
    @BreakStartTime  TIME = NULL,
    @BreakEndTime    TIME = NULL,
    @WorkingDaysMask TINYINT,
    @TimeZoneId      NVARCHAR(100) = 'UTC',
    @CreatedBy       INT,
    @Id              INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Locations
        (ChainId, Name, Address, OpenTime, CloseTime, BreakStartTime, BreakEndTime, WorkingDaysMask, TimeZoneId, CreatedBy)
    VALUES
        (@ChainId, @Name, @Address, @OpenTime, @CloseTime, @BreakStartTime, @BreakEndTime, @WorkingDaysMask, @TimeZoneId, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateLocation
    @Id              INT,
    @Name            NVARCHAR(200),
    @Address         NVARCHAR(400) = NULL,
    @OpenTime        TIME,
    @CloseTime       TIME,
    @BreakStartTime  TIME = NULL,
    @BreakEndTime    TIME = NULL,
    @WorkingDaysMask TINYINT,
    @TimeZoneId      NVARCHAR(100),
    @IsActive        BIT,
    @UpdatedBy       INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Locations
    SET Name = @Name, Address = @Address, OpenTime = @OpenTime, CloseTime = @CloseTime,
        BreakStartTime = @BreakStartTime, BreakEndTime = @BreakEndTime,
        WorkingDaysMask = @WorkingDaysMask, TimeZoneId = @TimeZoneId, IsActive = @IsActive,
        UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50022, 'Location not found.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_DeleteLocation
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Locations
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50022, 'Location not found.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetTreatmentCategories
    @LocationId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, LocationId, Name, IsActive
    FROM dbo.TreatmentCategories
    WHERE LocationId = @LocationId AND IsDelete = 0
    ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateTreatmentCategory
    @LocationId INT,
    @Name       NVARCHAR(200),
    @CreatedBy  INT,
    @Id         INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.TreatmentCategories
        (LocationId, Name, CreatedBy)
    VALUES
        (@LocationId, @Name, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateTreatmentCategory
    @Id        INT,
    @Name      NVARCHAR(200),
    @IsActive  BIT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.TreatmentCategories
    SET Name = @Name, IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50025, 'Treatment category not found.', 1;
END
GO

-- @EffectiveFrom is the treatment's own go-live date (client-portal visibility/bookability),
-- independent of price. @Price seeds its required first TreatmentPrices row, always effective
-- from today (the price's own effective date isn't backdated/postdated at creation -- schedule a
-- future price change afterwards via sp_Catalog_AddTreatmentPrice).
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateTreatment
    @LocationId    INT,
    @CategoryId    INT,
    @Name          NVARCHAR(200),
    @DurationSlots SMALLINT,
    @EffectiveFrom DATE,
    @Price         DECIMAL(10,2),
    @CreatedBy     INT,
    @Id            INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    INSERT INTO dbo.Treatments
        (LocationId, CategoryId, Name, DurationSlots, EffectiveFrom, CreatedBy)
    VALUES
        (@LocationId, @CategoryId, @Name, @DurationSlots, @EffectiveFrom, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();

    INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy)
    VALUES (@Id, @Price, CAST(GETUTCDATE() AS DATE), @CreatedBy);

    COMMIT TRANSACTION;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateTreatment
    @Id            INT,
    @CategoryId    INT,
    @Name          NVARCHAR(200),
    @DurationSlots SMALLINT,
    @EffectiveFrom DATE,
    @IsActive      BIT,
    @UpdatedBy     INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Treatments
    SET CategoryId = @CategoryId, Name = @Name, DurationSlots = @DurationSlots, EffectiveFrom = @EffectiveFrom,
        IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50023, 'Treatment not found.', 1;
END
GO

-- Schedules a new price for a treatment, effective from a given date -- never overwrites an
-- existing TreatmentPrices row, so past-dated prices stay intact for historical bookings. One
-- price per (treatment, date) -- UQ_TreatmentPrices_Treatment_EffectiveFrom is the hard backstop,
-- this check exists only to turn that into a clean 409 instead of a raw constraint-violation error.
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_AddTreatmentPrice
    @TreatmentId   INT,
    @Price         DECIMAL(10,2),
    @EffectiveFrom DATE,
    @CreatedBy     INT,
    @Id            INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Treatments WHERE Id = @TreatmentId AND IsDelete = 0)
        THROW 50023, 'Treatment not found.', 1;

    IF EXISTS (
        SELECT 1 FROM dbo.TreatmentPrices
        WHERE TreatmentId = @TreatmentId AND EffectiveFrom = @EffectiveFrom AND IsDelete = 0
    )
        THROW 50026, 'A price is already scheduled for this date.', 1;

    INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy)
    VALUES (@TreatmentId, @Price, @EffectiveFrom, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

-- Corrects a price's amount in place -- only while no non-cancelled booking has been captured
-- against this exact price row (BookingTreatments.TreatmentPriceId, set by
-- sp_Booking_CreateDraft/AddTreatment when they resolve a treatment's current price).
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateTreatmentPrice
    @Id        INT,
    @Price     DECIMAL(10,2),
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.TreatmentPrices WHERE Id = @Id AND IsDelete = 0)
        THROW 50023, 'Treatment not found.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.BookingTreatments bt
            JOIN dbo.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = 0
        WHERE bt.TreatmentPriceId = @Id AND bt.IsDelete = 0 AND b.Status <> 'Cancelled'
    )
        THROW 50027, 'Cannot edit this price -- it has already been used by a booking.', 1;

    UPDATE dbo.TreatmentPrices
    SET Price = @Price, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetTreatmentPrices
    @TreatmentId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Price, EffectiveFrom
    FROM dbo.TreatmentPrices
    WHERE TreatmentId = @TreatmentId AND IsDelete = 0
    ORDER BY EffectiveFrom DESC;
END
GO

-------------------------------------------------------------------------------------------------
-- Therapists / Rooms
-------------------------------------------------------------------------------------------------

-- @LocationId matches TherapistProfile.LocationId directly. @ChainId matches either
-- TherapistProfile.ChainId OR (via the linked Location) l.ChainId -- a Manager-created therapist
-- only ever gets LocationId set (see sp_Catalog_LinkTherapistScope/AdminStaffEndpoints), never
-- ChainId, so matching ChainId alone would silently drop those rows from an Admin's own-chain view.
-- A therapist with NEITHER set (created standalone from the Therapists page, not yet assigned to a
-- staff login) always matches -- unassigned rows are a shared pool visible to any caller until
-- claimed, not invisible to everyone.
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetTherapists
    @ChainId INT = NULL,
    @LocationId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT tp.Id, tp.Name, tp.IsActive, tp.ChainId, tp.LocationId
    FROM dbo.TherapistProfile tp
        LEFT JOIN dbo.Locations l ON l.Id = tp.LocationId
    WHERE tp.IsDelete = 0
        AND (@LocationId IS NULL OR tp.LocationId = @LocationId OR tp.LocationId IS NULL)
        AND (@ChainId IS NULL OR tp.ChainId = @ChainId OR l.ChainId = @ChainId OR (tp.ChainId IS NULL AND tp.LocationId IS NULL))
    ORDER BY tp.Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateTherapist
    @Name      NVARCHAR(200),
    @CreatedBy INT,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.TherapistProfile
        (Name, CreatedBy)
    VALUES
        (@Name, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateTherapist
    @Id        INT,
    @Name      NVARCHAR(200),
    @IsActive  BIT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.TherapistProfile
    SET Name = @Name, IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50024, 'Therapist not found.', 1;
END
GO

-- Keeps a TherapistProfile's scope mirrored to whichever Users row currently links to it (see
-- AdminStaffEndpoints) -- separate from sp_Catalog_UpdateTherapist so the plain Therapists-page
-- edit form (Name/IsActive only) can never blank these out by omission.
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_LinkTherapistScope
    @Id         INT,
    @ChainId    INT = NULL,
    @LocationId INT = NULL,
    @UserId     INT = NULL,
    @UpdatedBy  INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.TherapistProfile
    SET ChainId = @ChainId, LocationId = @LocationId, UserId = @UserId,
        UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetRooms
    @LocationId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, LocationId, Name, IsActive
    FROM dbo.Rooms
    WHERE LocationId = @LocationId AND IsDelete = 0
    ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateRoom
    @LocationId INT,
    @Name       NVARCHAR(100),
    @CreatedBy  INT,
    @Id         INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Rooms
        (LocationId, Name, CreatedBy)
    VALUES
        (@LocationId, @Name, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateRoom
    @Id        INT,
    @Name      NVARCHAR(100),
    @IsActive  BIT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Rooms
    SET Name = @Name, IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50025, 'Room not found.', 1;
END
GO

-------------------------------------------------------------------------------------------------
-- Bookings oversight
-------------------------------------------------------------------------------------------------

-- "For a location on a date" now means "has at least one treatment line scheduled that day" --
-- schedule lives per-treatment (BookingTreatments), not on the booking itself, since treatments
-- can be scheduled at independent times. Both queries filter by the line's own StartTime.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetForLocation
    @LocationId INT,
    @WorkDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    -- NOLOCK: scheduling-page read, same Bookings/BookingTreatments contention risk as the
    -- customer-facing reads above -- polled/refreshed often, not part of any write's correctness check.
    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.CustomerId, c.Name AS CustomerName,
        c.Email AS CustomerEmail, b.Status
    FROM dbo.Bookings b WITH (NOLOCK)
        JOIN dbo.Locations l WITH (NOLOCK) ON l.Id = b.LocationId
        JOIN dbo.Users c WITH (NOLOCK) ON c.Id = b.CustomerId
    WHERE b.LocationId = @LocationId AND b.IsDelete = 0
        AND b.Status <> 'Cancelled'
        AND EXISTS (
          SELECT 1
        FROM dbo.BookingTreatments bt WITH (NOLOCK)
        WHERE bt.BookingId = b.Id AND bt.IsDelete = 0 AND CAST(bt.StartTime AS DATE) = @WorkDate
      )
    ORDER BY b.Id;

    SELECT bt.BookingId, bt.TreatmentId, t.Name AS TreatmentName, r.Id AS RoomId, r.Name AS RoomName,
        bt.TherapistId, th.Name AS TherapistName, bt.StartTime, bt.EndTime,
        bt.SequenceOrder, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt WITH (NOLOCK)
        JOIN dbo.Treatments t WITH (NOLOCK) ON t.Id = bt.TreatmentId
        JOIN dbo.Bookings b WITH (NOLOCK) ON b.Id = bt.BookingId
        LEFT JOIN dbo.Rooms r WITH (NOLOCK) ON r.Id = bt.RoomId
        LEFT JOIN dbo.TherapistProfile th WITH (NOLOCK) ON th.Id = bt.TherapistId
    WHERE b.LocationId = @LocationId AND b.IsDelete = 0 AND bt.IsDelete = 0
        AND b.Status <> 'Cancelled'
        AND CAST(bt.StartTime AS DATE) = @WorkDate
    ORDER BY bt.StartTime;
END
GO

-- Pre-check for POST /api/admin/bookings/{id}/cancel -- Manager is location-scoped and must be
-- rejected before sp_Booking_CancelAsAdmin runs (that proc has no caller-scoping of its own, "Admin
-- override" above), not after, so AdminBookingEndpoints resolves the booking's location here first.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetLocationId
    @BookingId INT
AS
BEGIN
    SET NOCOUNT ON;
    -- NOLOCK: single-row lookup of an immutable column (LocationId never changes after creation).
    SELECT LocationId
    FROM dbo.Bookings WITH (NOLOCK)
    WHERE Id = @BookingId AND IsDelete = 0;
END
GO

-- Admin override: unlike sp_Booking_Cancel, does not require the caller to own the booking.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_CancelAsAdmin
    @BookingId INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Bookings
    SET Status = 'Cancelled', UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @BookingId AND IsDelete = 0 AND Status IN ('Draft', 'Confirmed');

    IF @@ROWCOUNT = 0
        THROW 50004, 'Booking not found.', 1;

    SELECT b.LocationId, bt.RoomId, CAST(bt.StartTime AS DATE) AS WorkDate
    FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = @BookingId AND bt.IsDelete = 0 AND bt.StartTime IS NOT NULL;
END
GO

-- Staff-as-customer emulation. Run after 01-07. Originally scoped to "Super Admin/Admin/Manager"
-- per docs/initial-project-spec.md; widened to every staff role (RootSuperAdmin/SuperAdmin/Admin/
-- Manager/Receptionist/Therapist/Other) so any staff member can be marked as emulator and access
-- the customer portal on a customer's behalf.

-- Powers the admin-portal "Customers" picker used to start an emulation session -- active customers
-- only, top 20, always requires @Search. Kept separate from sp_Admin_GetCustomers below (the full
-- management listing, inactive included, no row cap) so the picker stays fast and narrow.
CREATE OR ALTER PROCEDURE dbo.sp_Admin_SearchCustomers
    @Search NVARCHAR(200),
    @ChainId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (20)
        u.Id, u.Name, u.Email, u.Phone,
        CASE
            WHEN @ChainId IS NULL THEN CAST(1 AS BIT)
            WHEN EXISTS (
                SELECT 1
        FROM dbo.Bookings b
            JOIN dbo.Locations l ON l.Id = b.LocationId
        WHERE b.CustomerId = u.Id AND l.ChainId = @ChainId AND b.IsDelete = 0
            ) THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
        END AS CanEmulate
    FROM dbo.Users u
    WHERE u.Role = 'Customer' AND u.IsDelete = 0 AND u.IsActive = 1
        AND (u.Name LIKE '%' + @Search + '%' OR u.Email LIKE '%' + @Search + '%')
    ORDER BY u.Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetCustomers
    @Search NVARCHAR(200) = NULL,
    @ChainId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Name, u.Email, u.Phone, u.IsActive, u.CreatedDate,
        CASE
            WHEN @ChainId IS NULL THEN CAST(1 AS BIT)
            WHEN EXISTS (
                SELECT 1
        FROM dbo.Bookings b
            JOIN dbo.Locations l ON l.Id = b.LocationId
        WHERE b.CustomerId = u.Id AND l.ChainId = @ChainId AND b.IsDelete = 0
            ) THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
        END AS CanEmulate
    FROM dbo.Users u
    WHERE u.Role = 'Customer' AND u.IsDelete = 0
        AND (@Search IS NULL OR u.Name LIKE '%' + @Search + '%' OR u.Email LIKE '%' + @Search + '%')
    ORDER BY u.Name;
END
GO

-- Customer counterpart to sp_Admin_UpdateUser -- deliberately narrow (Name/Phone/IsActive only, no
-- Role/ChainId/LocationId/TherapistId/IsEmulator, none of which apply to a customer) and restricted
-- to Role = 'Customer' so this can never be pointed at a staff row by id.
CREATE OR ALTER PROCEDURE dbo.sp_Admin_UpdateCustomer
    @Id        INT,
    @Name      NVARCHAR(200),
    @Phone     NVARCHAR(30) = NULL,
    @IsActive  BIT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users
    SET Name = @Name, Phone = @Phone, IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0 AND Role = 'Customer';

    IF @@ROWCOUNT = 0
        THROW 50042, 'Customer not found.', 1;
END
GO

-- Soft-delete, same convention as chains/locations (IsDelete, not a hard DELETE). Restricted to
-- Role = 'Customer' for the same reason as sp_Admin_UpdateCustomer above.
CREATE OR ALTER PROCEDURE dbo.sp_Admin_DeleteCustomer
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0 AND Role = 'Customer';

    IF @@ROWCOUNT = 0
        THROW 50043, 'Customer not found.', 1;
END
GO

-- Staff scheduling: therapist shift assignments + room-category openings, for the admin portal's
-- Scheduling page (SuperAdmin/Admin/Manager/Receptionist -- see docs/architecture.md's "Shift/room-assignment CRUD" gap).
-- Reuses dbo.ShiftAssignments/dbo.RoomCategoryAssignments, which existed as schema only until now
-- (seeded manually via 06_seed.sql, read only by sp_Booking_GetAvailabilityData for slot math).
-- Run after 01-08.

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetRoster
    @LocationId INT,
    @WorkDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    SELECT sa.Id, sa.TherapistId, th.Name AS TherapistName, sa.RoomId, sa.ShiftType, sa.StartTime, sa.EndTime
    FROM dbo.ShiftAssignments sa
        JOIN dbo.TherapistProfile th ON th.Id = sa.TherapistId
    WHERE sa.LocationId = @LocationId AND sa.WorkDate = @WorkDate AND sa.IsDelete = 0
    ORDER BY sa.ShiftType, th.Name;

    SELECT rca.Id, rca.RoomId, r.Name AS RoomName, rca.TreatmentCategoryId, tc.Name AS CategoryName, rca.ShiftType
    FROM dbo.RoomCategoryAssignments rca
        JOIN dbo.Rooms r ON r.Id = rca.RoomId
        JOIN dbo.TreatmentCategories tc ON tc.Id = rca.TreatmentCategoryId
    WHERE r.LocationId = @LocationId AND rca.WorkDate = @WorkDate AND rca.IsDelete = 0
    ORDER BY rca.ShiftType, r.Name;

    SELECT bs.Id, bs.RoomId, r.Name AS RoomName, bs.StartTime, bs.EndTime, bs.Reason, CAST(0 AS BIT) AS IsLocationBreak
    FROM dbo.BlockedSlots bs
        JOIN dbo.Rooms r ON r.Id = bs.RoomId
    WHERE r.LocationId = @LocationId AND bs.WorkDate = @WorkDate AND bs.IsDelete = 0

    UNION ALL

    SELECT 
        0 AS Id, 
        r.Id AS RoomId, 
        r.Name AS RoomName, 
        COALESCE(l.BreakStartTime, c.BreakStartTime) AS StartTime, 
        COALESCE(l.BreakEndTime, c.BreakEndTime) AS EndTime, 
        N'Lunch Break' AS Reason,
        CAST(1 AS BIT) AS IsLocationBreak
    FROM dbo.Locations l
    JOIN dbo.SaloonChains c ON c.Id = l.ChainId
    CROSS JOIN dbo.Rooms r
    WHERE l.Id = @LocationId 
      AND r.LocationId = l.Id 
      AND r.IsDelete = 0 AND r.IsActive = 1
      AND COALESCE(l.BreakStartTime, c.BreakStartTime) IS NOT NULL 
      AND COALESCE(l.BreakEndTime, c.BreakEndTime) IS NOT NULL

    ORDER BY RoomName, StartTime;
END
GO

-- Upsert keyed on UQ_ShiftAssignments_Location_Therapist_Shift_Date (RoomId is NOT part of the key):
-- a therapist works one room per shift, so re-assigning them to a different room moves the existing
-- row (updates RoomId + times) instead of creating a second, overlapping assignment. Symmetrically,
-- a room holds one therapist per shift, so whoever else is already in @RoomId for this shift/date
-- gets bumped (soft-deleted) first -- see UQ_ShiftAssignments_Location_Room_Shift_Date.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_AssignTherapistShift
    @LocationId  INT,
    @TherapistId INT,
    @RoomId      INT,
    @ShiftType   VARCHAR(10),
    @WorkDate    DATE,
    @StartTime   TIME,
    @EndTime     TIME,
    @CreatedBy   INT,
    @Id          INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.ShiftAssignments
    SET IsDelete = 1, UpdatedBy = @CreatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE LocationId = @LocationId AND RoomId = @RoomId AND ShiftType = @ShiftType AND WorkDate = @WorkDate
        AND TherapistId <> @TherapistId AND IsDelete = 0;

    MERGE dbo.ShiftAssignments AS target
    USING (SELECT @LocationId AS LocationId, @TherapistId AS TherapistId, @ShiftType AS ShiftType, @WorkDate AS WorkDate) AS src
        ON target.LocationId = src.LocationId AND target.TherapistId = src.TherapistId
        AND target.ShiftType = src.ShiftType AND target.WorkDate = src.WorkDate
    WHEN MATCHED THEN
        UPDATE SET RoomId = @RoomId, StartTime = @StartTime, EndTime = @EndTime, IsActive = 1, IsDelete = 0,
                   UpdatedBy = @CreatedBy, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (LocationId, TherapistId, RoomId, ShiftType, WorkDate, StartTime, EndTime, CreatedBy)
        VALUES (@LocationId, @TherapistId, @RoomId, @ShiftType, @WorkDate, @StartTime, @EndTime, @CreatedBy);

    SELECT @Id = Id
    FROM dbo.ShiftAssignments
    WHERE LocationId = @LocationId AND TherapistId = @TherapistId AND ShiftType = @ShiftType AND WorkDate = @WorkDate;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_RemoveTherapistShift
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.ShiftAssignments
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50030, 'Shift assignment not found.', 1;
END
GO

-- Ownership lookup for DELETE /therapist-shifts/{id} -- the request carries only the shift id, not
-- its location, so SchedulingEndpoints checks the returned LocationId against the caller's own
-- before deleting (Manager/Receptionist are otherwise able to remove any shift in the system by id).
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetShiftLocationId
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT LocationId
    FROM dbo.ShiftAssignments
    WHERE Id = @Id AND IsDelete = 0;
END
GO

-- Upsert keyed on UQ_RoomCategoryAssignments_Room_Shift_Date: a room serves one category per
-- shift/date, so "opening" it again with a different category just changes which one.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_OpenRoom
    @RoomId              INT,
    @TreatmentCategoryId INT,
    @ShiftType           VARCHAR(10),
    @WorkDate            DATE,
    @CreatedBy           INT,
    @Id                  INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.RoomCategoryAssignments AS target
    USING (SELECT @RoomId AS RoomId, @ShiftType AS ShiftType, @WorkDate AS WorkDate) AS src
        ON target.RoomId = src.RoomId AND target.ShiftType = src.ShiftType AND target.WorkDate = src.WorkDate
    WHEN MATCHED THEN
        UPDATE SET TreatmentCategoryId = @TreatmentCategoryId, IsActive = 1, IsDelete = 0,
                   UpdatedBy = @CreatedBy, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (RoomId, TreatmentCategoryId, ShiftType, WorkDate, CreatedBy)
        VALUES (@RoomId, @TreatmentCategoryId, @ShiftType, @WorkDate, @CreatedBy);

    SELECT @Id = Id
    FROM dbo.RoomCategoryAssignments
    WHERE RoomId = @RoomId AND ShiftType = @ShiftType AND WorkDate = @WorkDate;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_CloseRoom
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RoomCategoryAssignments
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50031, 'Room opening not found.', 1;
END
GO

-- Ownership lookup for DELETE /room-openings/{id} -- same reasoning as sp_Scheduling_GetShiftLocationId
-- above, resolved through the opening's Room since RoomCategoryAssignments has no LocationId of its own.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetRoomOpeningLocationId
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT r.LocationId
    FROM dbo.RoomCategoryAssignments rca
        JOIN dbo.Rooms r ON r.Id = rca.RoomId
    WHERE rca.Id = @Id AND rca.IsDelete = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetShiftDetails
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT LocationId, WorkDate, RoomId, TherapistId, ShiftType
    FROM dbo.ShiftAssignments
    WHERE Id = @Id AND IsDelete = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_HasShiftBookings
    @ShiftId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.ShiftAssignments sa
        JOIN dbo.BookingTreatments bt ON (bt.RoomId = sa.RoomId OR bt.TherapistId = sa.TherapistId)
            AND bt.StartTime IS NOT NULL AND CAST(bt.StartTime AS DATE) = sa.WorkDate
            AND bt.IsDelete = 0
        JOIN dbo.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = 0
        WHERE sa.Id = @ShiftId AND sa.IsDelete = 0
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > SYSUTCDATETIME()))
    ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasBookings;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetRoomOpeningDetails
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT rca.Id, r.LocationId, rca.RoomId, rca.WorkDate, rca.ShiftType, rca.TreatmentCategoryId
    FROM dbo.RoomCategoryAssignments rca
        JOIN dbo.Rooms r ON r.Id = rca.RoomId
    WHERE rca.Id = @Id AND rca.IsDelete = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetRoomOpeningByKeys
    @RoomId    INT,
    @WorkDate  DATE,
    @ShiftType VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT rca.Id, r.LocationId, rca.RoomId, rca.WorkDate, rca.ShiftType, rca.TreatmentCategoryId
    FROM dbo.RoomCategoryAssignments rca
        JOIN dbo.Rooms r ON r.Id = rca.RoomId
    WHERE rca.RoomId = @RoomId AND rca.WorkDate = @WorkDate AND rca.ShiftType = @ShiftType AND rca.IsDelete = 0;
END
GO

-- A closed room (no room opening at all for the date, any shift) has no bookable capacity to carve
-- unavailability out of -- sp_Scheduling_BlockSlot's caller checks this before blocking a slot.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_HasRoomOpening
    @RoomId   INT,
    @WorkDate DATE
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.RoomCategoryAssignments rca
        WHERE rca.RoomId = @RoomId AND rca.WorkDate = @WorkDate AND rca.IsDelete = 0
    ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasRoomOpening;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_HasRoomBookings
    @RoomId   INT,
    @WorkDate DATE
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = 0
        WHERE bt.RoomId = @RoomId
            AND bt.StartTime IS NOT NULL AND CAST(bt.StartTime AS DATE) = @WorkDate
            AND bt.IsDelete = 0
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > SYSUTCDATETIME()))
    ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasBookings;
END
GO

-- Time-range-aware version of sp_Scheduling_HasRoomBookings above, used before blocking a slot --
-- a whole-day check would reject blocking e.g. a 12:00-12:30 lunch break just because the room has
-- an unrelated 15:00 booking that same day.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_HasBookingOverlap
    @RoomId    INT,
    @WorkDate  DATE,
    @StartTime TIME,
    @EndTime   TIME
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.BookingTreatments bt
        JOIN dbo.Bookings b ON b.Id = bt.BookingId AND b.IsDelete = 0
        WHERE bt.RoomId = @RoomId
            AND bt.StartTime IS NOT NULL AND CAST(bt.StartTime AS DATE) = @WorkDate
            AND bt.IsDelete = 0
            AND CAST(bt.StartTime AS TIME) < @EndTime AND CAST(bt.EndTime AS TIME) > @StartTime
            AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > SYSUTCDATETIME()))
    ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasOverlap;
END
GO

-- Two blocks covering the same room/time would silently collide in the admin grid (whichever one's
-- rowSpan is computed last wins that grid position, the other vanishes) -- reject a new block that
-- overlaps an existing one instead of allowing that state to happen.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_HasBlockOverlap
    @RoomId    INT,
    @WorkDate  DATE,
    @StartTime TIME,
    @EndTime   TIME
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.BlockedSlots bs
        WHERE bs.RoomId = @RoomId AND bs.WorkDate = @WorkDate AND bs.IsDelete = 0
            AND bs.StartTime < @EndTime AND bs.EndTime > @StartTime
        UNION ALL
        SELECT 1
        FROM dbo.Rooms r
            JOIN dbo.Locations l ON l.Id = r.LocationId
            JOIN dbo.SaloonChains c ON c.Id = l.ChainId
        WHERE r.Id = @RoomId AND r.IsDelete = 0 AND l.IsDelete = 0 AND l.IsActive = 1
            AND COALESCE(l.BreakStartTime, c.BreakStartTime) IS NOT NULL 
            AND COALESCE(l.BreakEndTime, c.BreakEndTime) IS NOT NULL
            AND COALESCE(l.BreakStartTime, c.BreakStartTime) < @EndTime 
            AND COALESCE(l.BreakEndTime, c.BreakEndTime) > @StartTime
    ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasOverlap;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_BlockSlot
    @RoomId    INT,
    @WorkDate  DATE,
    @StartTime TIME,
    @EndTime   TIME,
    @Reason    NVARCHAR(200),
    @CreatedBy INT,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.BlockedSlots (RoomId, WorkDate, StartTime, EndTime, Reason, CreatedBy)
    VALUES (@RoomId, @WorkDate, @StartTime, @EndTime, @Reason, @CreatedBy);

    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_UnblockSlot
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.BlockedSlots
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50032, 'Blocked slot not found.', 1;
END
GO

-- Ownership lookup for DELETE /blocked-slots/{id} -- same reasoning as sp_Scheduling_GetShiftLocationId.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetBlockedSlotDetails
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT bs.Id, r.LocationId, bs.RoomId, bs.WorkDate, bs.StartTime, bs.EndTime, bs.Reason
    FROM dbo.BlockedSlots bs
        JOIN dbo.Rooms r ON r.Id = bs.RoomId
    WHERE bs.Id = @Id AND bs.IsDelete = 0;
END
GO


-- Self-service profile management (any logged-in role) -- name/phone editing and a profile photo,
-- backed by dbo.StaffProfiles/dbo.CustomerProfiles (see 01_tables.sql). Run after 01-09.

CREATE OR ALTER PROCEDURE dbo.sp_Profile_GetStaff
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Name, u.Email, u.Phone, u.Role, sp.PhotoPath, u.IsEmailVerified
    FROM dbo.Users u
        LEFT JOIN dbo.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Id = @UserId AND u.IsDelete = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Profile_GetCustomer
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Email, Phone, Role, ProfilePhoto AS PhotoPath, IsEmailVerified
    FROM dbo.Users
    WHERE Id = @UserId AND IsDelete = 0;
END
GO

-- Deliberately narrow (Name/Phone only) -- unlike sp_Admin_UpdateUser, this is self-service, so it
-- must never touch Role/ChainId/LocationId/TherapistId/IsEmulator/IsActive.
CREATE OR ALTER PROCEDURE dbo.sp_Profile_UpdateSelf
    @UserId INT,
    @Name   NVARCHAR(200),
    @Phone  NVARCHAR(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users
    SET Name = @Name, Phone = @Phone, UpdatedBy = @UserId, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @UserId AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50040, 'User not found.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Profile_SetStaffPhoto
    @UserId    INT,
    @PhotoPath NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.StaffProfiles AS target
    USING (SELECT @UserId AS UserId) AS src ON target.UserId = src.UserId
    WHEN MATCHED THEN
        UPDATE SET PhotoPath = @PhotoPath, UpdatedBy = @UserId, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, PhotoPath, UpdatedBy, UpdatedDate) VALUES (@UserId, @PhotoPath, @UserId, SYSUTCDATETIME());
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Profile_SetCustomerPhoto
    @UserId    INT,
    @PhotoPath NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users
    SET ProfilePhoto = @PhotoPath, UpdatedBy = @UserId, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @UserId AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50041, 'Customer not found.', 1;
END
GO

-- Stored procedures for Payment management

CREATE OR ALTER PROCEDURE dbo.sp_Payment_Create
    @BookingId     INT,
    @Amount        DECIMAL(10,2),
    @Currency      VARCHAR(10),
    @Provider      VARCHAR(30),
    @PaymentMethod VARCHAR(30),
    @Status        VARCHAR(20),
    @TransactionId NVARCHAR(200) = NULL,
    @ClientSecret  NVARCHAR(500) = NULL,
    @CreatedBy     INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Payments
        (
        BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, ClientSecret, CreatedBy, CreatedDate
        )
    VALUES
        (
            @BookingId, @Amount, @Currency, @Provider, @PaymentMethod, @Status, @TransactionId, @ClientSecret, @CreatedBy, SYSUTCDATETIME()
    );

    SELECT CAST(SCOPE_IDENTITY() AS INT);
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Payment_UpdateStatus
    @PaymentId     INT,
    @Status        VARCHAR(20),
    @TransactionId NVARCHAR(200) = NULL,
    @FailureReason NVARCHAR(500) = NULL,
    @UpdatedBy     INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Payments
    SET Status = @Status,
        TransactionId = ISNULL(@TransactionId, TransactionId),
        FailureReason = @FailureReason,
        UpdatedBy = @UpdatedBy,
        UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @PaymentId AND IsDelete = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Payment_GetByBookingId
    @BookingId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id, BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, ClientSecret, FailureReason, CreatedBy, CreatedDate
    FROM dbo.Payments
    WHERE BookingId = @BookingId AND IsDelete = 0
    ORDER BY Id DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Payment_GetById
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id, BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, ClientSecret, FailureReason, CreatedBy, CreatedDate
    FROM dbo.Payments
    WHERE Id = @Id AND IsDelete = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_User_UpdateStripeCustomerId
    @UserId           INT,
    @StripeCustomerId NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Users
    SET StripeCustomerId = @StripeCustomerId,
        UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @UserId AND IsDelete = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_Search
    @Search NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        l.Id, l.ChainId, c.Name AS ChainName, l.Name, l.Address,
        l.OpenTime, l.CloseTime, l.WorkingDaysMask, l.TimeZoneId
    FROM dbo.Locations l
        JOIN dbo.SaloonChains c ON c.Id = l.ChainId
        LEFT JOIN dbo.Treatments t ON t.LocationId = l.Id AND t.IsDelete = 0 AND t.IsActive = 1
        LEFT JOIN dbo.TreatmentCategories tc ON tc.Id = t.CategoryId AND tc.IsDelete = 0 AND tc.IsActive = 1
    WHERE l.IsDelete = 0 AND l.IsActive = 1 AND c.IsDelete = 0 AND c.IsActive = 1
        AND (
            @Search IS NULL OR TRIM(@Search) = '' OR
            c.Name LIKE '%' + @Search + '%' OR
            l.Name LIKE '%' + @Search + '%' OR
            l.Address LIKE '%' + @Search + '%' OR
            t.Name LIKE '%' + @Search + '%' OR
            tc.Name LIKE '%' + @Search + '%'
        )
    ORDER BY l.Name;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetDashboardStats
    @Role       NVARCHAR(50),
    @ChainId    INT = NULL,
    @LocationId INT = NULL,
    @StartDate  DATE = NULL,
    @EndDate    DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @StartDate IS NULL
        SET @StartDate = CAST(SYSUTCDATETIME() AS DATE);

    IF @EndDate IS NULL
        SET @EndDate = @StartDate;

    DECLARE @Yesterday DATE = DATEADD(day, -1, @StartDate);

    DECLARE @ScopedLocations TABLE (LocationId INT PRIMARY KEY);

    IF @Role IN ('RootSuperAdmin', 'root_super_admin')
    BEGIN
        INSERT INTO @ScopedLocations (LocationId)
        SELECT Id FROM dbo.Locations WHERE IsDelete = 0 AND IsActive = 1;
    END
    ELSE IF @Role IN ('SuperAdmin', 'Admin', 'superadmin', 'admin') AND @ChainId IS NOT NULL
    BEGIN
        INSERT INTO @ScopedLocations (LocationId)
        SELECT Id FROM dbo.Locations WHERE ChainId = @ChainId AND IsDelete = 0 AND IsActive = 1;
    END
    ELSE IF @LocationId IS NOT NULL
    BEGIN
        INSERT INTO @ScopedLocations (LocationId)
        VALUES (@LocationId);
    END
    ELSE IF @ChainId IS NOT NULL
    BEGIN
        INSERT INTO @ScopedLocations (LocationId)
        SELECT Id FROM dbo.Locations WHERE ChainId = @ChainId AND IsDelete = 0 AND IsActive = 1;
    END
    ELSE
    BEGIN
        INSERT INTO @ScopedLocations (LocationId)
        SELECT Id FROM dbo.Locations WHERE IsDelete = 0 AND IsActive = 1;
    END;

    DECLARE @TodayRevenue DECIMAL(18, 2) = 0;
    DECLARE @YesterdayRevenue DECIMAL(18, 2) = 0;
    DECLARE @AppointmentsToday INT = 0;
    DECLARE @AppointmentsInProgress INT = 0;
    DECLARE @ActiveTherapists INT = 0;

    SELECT @TodayRevenue = ISNULL(SUM(p.Amount), 0)
    FROM dbo.Payments p
        JOIN dbo.Bookings b ON b.Id = p.BookingId
        JOIN @ScopedLocations sl ON sl.LocationId = b.LocationId
    WHERE p.Status = 'Succeeded'
      AND p.IsDelete = 0
      AND CAST(p.CreatedDate AS DATE) BETWEEN @StartDate AND @EndDate;

    SELECT @YesterdayRevenue = ISNULL(SUM(p.Amount), 0)
    FROM dbo.Payments p
        JOIN dbo.Bookings b ON b.Id = p.BookingId
        JOIN @ScopedLocations sl ON sl.LocationId = b.LocationId
    WHERE p.Status = 'Succeeded'
      AND p.IsDelete = 0
      AND CAST(p.CreatedDate AS DATE) = @Yesterday;

    SELECT @AppointmentsToday = COUNT(DISTINCT b.Id)
    FROM dbo.Bookings b
        JOIN dbo.BookingTreatments bt ON bt.BookingId = b.Id
        JOIN @ScopedLocations sl ON sl.LocationId = b.LocationId
    WHERE b.Status <> 'Cancelled'
      AND b.IsDelete = 0
      AND bt.IsDelete = 0
      AND ((CAST(bt.StartTime AS DATE) BETWEEN @StartDate AND @EndDate) OR (bt.StartTime IS NULL AND CAST(b.CreatedDate AS DATE) BETWEEN @StartDate AND @EndDate));

    SELECT @AppointmentsInProgress = COUNT(DISTINCT b.Id)
    FROM dbo.Bookings b
        JOIN dbo.BookingTreatments bt ON bt.BookingId = b.Id
        JOIN @ScopedLocations sl ON sl.LocationId = b.LocationId
    WHERE b.Status = 'Confirmed'
      AND b.IsDelete = 0
      AND bt.IsDelete = 0
      AND ((CAST(bt.StartTime AS DATE) BETWEEN @StartDate AND @EndDate) OR (bt.StartTime IS NULL AND CAST(b.CreatedDate AS DATE) BETWEEN @StartDate AND @EndDate));

    SELECT @ActiveTherapists = COUNT(DISTINCT tp.Id)
    FROM dbo.TherapistProfile tp
    WHERE tp.IsActive = 1 AND tp.IsDelete = 0
      AND (
          tp.LocationId IN (SELECT LocationId FROM @ScopedLocations)
          OR tp.LocationId IS NULL
      );

    -- 1st Result Set: Aggregated KPIs
    SELECT
        @TodayRevenue AS TodayRevenue,
        @YesterdayRevenue AS YesterdayRevenue,
        @AppointmentsToday AS AppointmentsToday,
        @AppointmentsInProgress AS AppointmentsInProgress,
        @ActiveTherapists AS ActiveTherapists;

    -- 2nd Result Set: Today's / Date Range Upcoming Appointments List
    SELECT TOP 20
        b.Id AS BookingId,
        CAST(ISNULL(bt.StartTime, b.CreatedDate) AS TIME) AS StartTimeSlot,
        CAST(ISNULL(bt.EndTime, DATEADD(minute, 30, b.CreatedDate)) AS TIME) AS EndTimeSlot,
        c.Name AS CustomerName,
        l.Name AS LocationName,
        tp.Name AS TherapistName,
        b.Status,
        ISNULL((SELECT SUM(Price) FROM dbo.BookingTreatments WHERE BookingId = b.Id AND IsDelete = 0), 0) AS TotalAmount
    FROM dbo.Bookings b
        JOIN @ScopedLocations sl ON sl.LocationId = b.LocationId
        JOIN dbo.Locations l ON l.Id = b.LocationId
        JOIN dbo.Users c ON c.Id = b.CustomerId
        LEFT JOIN dbo.BookingTreatments bt ON bt.BookingId = b.Id AND bt.SequenceOrder = 1 AND bt.IsDelete = 0
        LEFT JOIN dbo.TherapistProfile tp ON tp.Id = bt.TherapistId
    WHERE b.IsDelete = 0
      AND b.Status <> 'Cancelled'
      AND ((CAST(bt.StartTime AS DATE) BETWEEN @StartDate AND @EndDate) OR (bt.StartTime IS NULL AND CAST(b.CreatedDate AS DATE) BETWEEN @StartDate AND @EndDate))
    ORDER BY ISNULL(bt.StartTime, b.CreatedDate) ASC;
END;
GO