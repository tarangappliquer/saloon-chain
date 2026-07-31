CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetAvailabilityData
    @LocationId   INT,
    @TreatmentIds dbo.IntIdList READONLY,
    @WorkDate     DATE
AS
BEGIN
    SET NOCOUNT ON;

    -- 1) location hours (+ explicit holiday flag, independent of whether shifts happen to exist that day)
    SELECT l.OpenTime, l.CloseTime, l.WorkingDaysMask,
           CASE WHEN EXISTS (
               SELECT 1 FROM dbo.LocationHolidays h
               WHERE h.LocationId = l.Id AND h.HolidayDate = @WorkDate AND h.IsDelete = 0 AND h.IsActive = 1
           ) THEN 1 ELSE 0 END AS IsHoliday
    FROM dbo.Locations l
    WHERE l.Id = @LocationId AND l.IsDelete = 0 AND l.IsActive = 1;

    -- 2) requested treatments (duration/category/price) as offered at this location
    SELECT t.Id, t.CategoryId, t.DurationSlots, COALESCE(lt.PriceOverride, t.Price) AS Price
    FROM dbo.Treatments t
    JOIN @TreatmentIds ti ON ti.Id = t.Id
    JOIN dbo.LocationTreatments lt ON lt.TreatmentId = t.Id AND lt.LocationId = @LocationId
    WHERE t.IsDelete = 0 AND t.IsActive = 1 AND lt.IsDelete = 0 AND lt.IsActive = 1;

    -- 3) eligible room/therapist pairs for the date, for the category of the requested treatments
    SELECT DISTINCT rca.RoomId, sa.TherapistId, sa.ShiftType, sa.StartTime AS ShiftStart, sa.EndTime AS ShiftEnd
    FROM dbo.RoomCategoryAssignments rca
    JOIN dbo.Rooms r ON r.Id = rca.RoomId AND r.LocationId = @LocationId AND r.IsDelete = 0 AND r.IsActive = 1
    JOIN dbo.ShiftAssignments sa ON sa.LocationId = @LocationId
        AND sa.WorkDate = rca.WorkDate AND sa.ShiftType = rca.ShiftType
        AND sa.IsDelete = 0 AND sa.IsActive = 1
    WHERE rca.WorkDate = @WorkDate AND rca.IsDelete = 0 AND rca.IsActive = 1
      AND rca.TreatmentCategoryId IN (
          SELECT DISTINCT t.CategoryId FROM dbo.Treatments t JOIN @TreatmentIds ti ON ti.Id = t.Id
      );

    -- 4) existing bookings that day for rooms at this location (confirmed, or held and not yet expired)
    SELECT b.RoomId, b.TherapistId, b.StartTime, b.EndTime
    FROM dbo.Bookings b
    JOIN dbo.Rooms r ON r.Id = b.RoomId AND r.LocationId = @LocationId
    WHERE CAST(b.StartTime AS DATE) = @WorkDate AND b.IsDelete = 0
      AND (b.Status = 'Confirmed' OR (b.Status = 'Held' AND b.ExpiresAt > SYSUTCDATETIME()));
END
GO

-- Correctness boundary: everything above is read-only advisory data for the API to compute
-- candidate slots from. This proc re-validates under an app lock before writing, so a stale
-- read (or a race between two customers) can never produce a double-booking.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_CreateHold
    @LocationId   INT,
    @RoomId       INT,
    @TherapistId  INT,
    @CustomerId   INT,
    @StartTime    DATETIME2,
    @EndTime      DATETIME2,
    @Treatments   dbo.IntIdList READONLY,
    @CreatedBy    INT = NULL, -- current logged-in user; equals @CustomerId today, will differ once
                               -- admin/receptionist can book on a customer's behalf
    @BookingId    INT OUTPUT,
    @ExpiresAt    DATETIME2 OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @LockKey NVARCHAR(100) = CONCAT('room_', @RoomId, '_', CONVERT(VARCHAR(10), @StartTime, 23));
    DECLARE @LockResult INT;

    BEGIN TRANSACTION;

    EXEC @LockResult = sp_getapplock @Resource = @LockKey, @LockMode = 'Exclusive',
                                      @LockOwner = 'Transaction', @LockTimeout = 5000;
    IF @LockResult < 0
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50001, 'Could not acquire booking lock, try again.', 1;
    END

    IF EXISTS (
        SELECT 1 FROM dbo.Bookings
        WHERE (RoomId = @RoomId OR TherapistId = @TherapistId)
          AND IsDelete = 0
          AND (Status = 'Confirmed' OR (Status = 'Held' AND ExpiresAt > SYSUTCDATETIME()))
          AND StartTime < @EndTime AND EndTime > @StartTime
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50002, 'Slot no longer available.', 1;
    END

    SET @ExpiresAt = DATEADD(MINUTE, 5, SYSUTCDATETIME());

    INSERT INTO dbo.Bookings (LocationId, RoomId, TherapistId, CustomerId, StartTime, EndTime, Status, ExpiresAt, CreatedBy)
    VALUES (@LocationId, @RoomId, @TherapistId, @CustomerId, @StartTime, @EndTime, 'Held', @ExpiresAt, @CreatedBy);

    SET @BookingId = SCOPE_IDENTITY();

    INSERT INTO dbo.BookingTreatments (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, CreatedBy)
    SELECT @BookingId, t.Id, ROW_NUMBER() OVER (ORDER BY t.Id), t.DurationSlots, COALESCE(lt.PriceOverride, t.Price), @CreatedBy
    FROM dbo.Treatments t
    JOIN @Treatments ti ON ti.Id = t.Id
    JOIN dbo.LocationTreatments lt ON lt.TreatmentId = t.Id AND lt.LocationId = @LocationId;

    COMMIT TRANSACTION;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_Confirm
    @BookingId  INT,
    @CustomerId INT,
    @UpdatedBy  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Bookings
    SET Status = 'Confirmed', ExpiresAt = NULL, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @BookingId AND CustomerId = @CustomerId AND IsDelete = 0
      AND Status = 'Held' AND ExpiresAt > SYSUTCDATETIME();

    IF @@ROWCOUNT = 0
        THROW 50003, 'Hold not found or expired.', 1;

    SELECT LocationId, RoomId, CAST(StartTime AS DATE) AS WorkDate FROM dbo.Bookings WHERE Id = @BookingId;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_Cancel
    @BookingId  INT,
    @CustomerId INT,
    @UpdatedBy  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Bookings
    SET Status = 'Cancelled', UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @BookingId AND CustomerId = @CustomerId AND IsDelete = 0
      AND Status IN ('Held','Confirmed');

    IF @@ROWCOUNT = 0
        THROW 50004, 'Booking not found.', 1;

    SELECT LocationId, RoomId, CAST(StartTime AS DATE) AS WorkDate FROM dbo.Bookings WHERE Id = @BookingId;
END
GO

-- Called every ~30s by a background job -- no logged-in user in that context, so UpdatedBy stays
-- NULL (system-driven). Returns the (location,room,date) tuples that flipped so the API can
-- invalidate the availability cache and nudge SSE subscribers for just those groups.
CREATE OR ALTER PROCEDURE dbo.sp_Booking_ExpireStaleHolds
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Expired TABLE (LocationId INT, RoomId INT, WorkDate DATE);

    UPDATE dbo.Bookings
    SET Status = 'Expired', UpdatedDate = SYSUTCDATETIME()
    OUTPUT inserted.LocationId, inserted.RoomId, CAST(inserted.StartTime AS DATE) INTO @Expired
    WHERE Status = 'Held' AND ExpiresAt <= SYSUTCDATETIME() AND IsDelete = 0;

    SELECT DISTINCT LocationId, RoomId, WorkDate FROM @Expired;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetMine
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.RoomId, b.TherapistId, th.Name AS TherapistName,
           b.StartTime, b.EndTime, b.Status
    FROM dbo.Bookings b
    JOIN dbo.Locations l ON l.Id = b.LocationId
    JOIN dbo.Therapists th ON th.Id = b.TherapistId
    WHERE b.CustomerId = @CustomerId AND b.Status IN ('Held','Confirmed') AND b.IsDelete = 0
    ORDER BY b.StartTime DESC;

    SELECT bt.BookingId, bt.TreatmentId, t.Name AS TreatmentName, bt.SequenceOrder, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt
    JOIN dbo.Treatments t ON t.Id = bt.TreatmentId
    JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE b.CustomerId = @CustomerId AND b.Status IN ('Held','Confirmed') AND b.IsDelete = 0 AND bt.IsDelete = 0;
END
GO
