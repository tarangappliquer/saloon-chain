CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetChains
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name FROM dbo.SaloonChains WHERE IsDelete = 0 AND IsActive = 1 ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetLocations
    @ChainId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, ChainId, Name, Address, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId
    FROM dbo.Locations
    WHERE ChainId = @ChainId AND IsDelete = 0 AND IsActive = 1
    ORDER BY Name;
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
    SELECT t.Id, t.CategoryId, tc.Name AS CategoryName, t.Name,
           COALESCE(lt.PriceOverride, t.Price) AS Price, t.DurationSlots
    FROM dbo.Treatments t
    JOIN dbo.LocationTreatments lt ON lt.TreatmentId = t.Id AND lt.LocationId = @LocationId
    JOIN dbo.TreatmentCategories tc ON tc.Id = t.CategoryId
    WHERE t.IsDelete = 0 AND t.IsActive = 1
      AND lt.IsDelete = 0 AND lt.IsActive = 1
      AND tc.IsDelete = 0 AND tc.IsActive = 1
      AND (@CategoryId IS NULL OR t.CategoryId = @CategoryId)
    ORDER BY tc.Name, t.Name;
END
GO

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
           ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsHoliday
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

    -- 4) scheduled treatment lines that day for rooms at this location (confirmed booking, or a
    -- draft line whose own hold hasn't expired). Status is returned so the API can tell a hard
    -- conflict (Confirmed) from a temporary one (an active Draft hold) and show the latter as
    -- disabled rather than hiding the slot outright.
    SELECT bt.RoomId, bt.TherapistId, bt.StartTime, bt.EndTime, b.Status
    FROM dbo.BookingTreatments bt
    JOIN dbo.Bookings b ON b.Id = bt.BookingId
    JOIN dbo.Rooms r ON r.Id = bt.RoomId AND r.LocationId = @LocationId
    WHERE bt.StartTime IS NOT NULL AND CAST(bt.StartTime AS DATE) = @WorkDate
      AND bt.IsDelete = 0 AND b.IsDelete = 0
      AND (b.Status = 'Confirmed' OR (b.Status = 'Draft' AND bt.ExpiresAt > SYSUTCDATETIME()));
END
GO

-- Creates the draft "cart" the moment treatments are picked, before any date/time exists --
-- 1 Bookings row (Status='Draft') + 1 unscheduled BookingTreatments row per treatment. No
-- room/therapist/time yet, so no lock/conflict-check needed here (that only matters once a
-- specific slot is claimed -- see sp_Booking_ScheduleTreatment below).
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

    INSERT INTO dbo.Bookings (LocationId, CustomerId, Status, CreatedBy)
    VALUES (@LocationId, @CustomerId, 'Draft', @CreatedBy);

    SET @BookingId = SCOPE_IDENTITY();

    INSERT INTO dbo.BookingTreatments (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, CreatedBy)
    SELECT @BookingId, t.Id, ROW_NUMBER() OVER (ORDER BY t.Id), t.DurationSlots, COALESCE(lt.PriceOverride, t.Price), @CreatedBy
    FROM dbo.Treatments t
    JOIN @Treatments ti ON ti.Id = t.Id
    JOIN dbo.LocationTreatments lt ON lt.TreatmentId = t.Id AND lt.LocationId = @LocationId
    WHERE t.IsDelete = 0 AND t.IsActive = 1 AND lt.IsDelete = 0 AND lt.IsActive = 1;

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

    SELECT @LocationId = LocationId FROM dbo.Bookings
    WHERE Id = @BookingId AND CustomerId = @CustomerId AND IsDelete = 0 AND Status = 'Draft';

    IF @LocationId IS NULL
        THROW 50005, 'Booking not found or not editable.', 1;

    SELECT @NextSeq = COALESCE(MAX(SequenceOrder), 0) + 1 FROM dbo.BookingTreatments WHERE BookingId = @BookingId;

    INSERT INTO dbo.BookingTreatments (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, CreatedBy)
    SELECT @BookingId, t.Id, @NextSeq, t.DurationSlots, COALESCE(lt.PriceOverride, t.Price), @CreatedBy
    FROM dbo.Treatments t
    JOIN dbo.LocationTreatments lt ON lt.TreatmentId = t.Id AND lt.LocationId = @LocationId
    WHERE t.Id = @TreatmentId AND t.IsDelete = 0 AND t.IsActive = 1 AND lt.IsDelete = 0 AND lt.IsActive = 1;

    IF @@ROWCOUNT = 0
        THROW 50006, 'Treatment not available at this location.', 1;
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

    DECLARE @Removed TABLE (LocationId INT, RoomId INT, StartTime DATETIME2);

    UPDATE bt
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    OUTPUT b.LocationId, deleted.RoomId, deleted.StartTime INTO @Removed
    FROM dbo.BookingTreatments bt
    JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE bt.BookingId = @BookingId AND bt.TreatmentId = @TreatmentId AND bt.IsDelete = 0
      AND b.CustomerId = @CustomerId AND b.IsDelete = 0 AND b.Status = 'Draft';

    IF @@ROWCOUNT = 0
        THROW 50007, 'Treatment not found on this booking.', 1;

    SELECT LocationId, RoomId, CAST(StartTime AS DATE) AS WorkDate FROM @Removed WHERE RoomId IS NOT NULL;
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

    SELECT TOP 1 @LocationId = b.LocationId
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

    IF NOT EXISTS (
        SELECT 1 FROM dbo.Bookings
        WHERE Id = @BookingId AND CustomerId = @CustomerId AND IsDelete = 0 AND Status = 'Draft'
    )
        THROW 50003, 'Booking not found or already finalized.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.BookingTreatments WHERE BookingId = @BookingId AND IsDelete = 0)
        THROW 50003, 'Booking has no treatments.', 1;

    IF EXISTS (
        SELECT 1 FROM dbo.BookingTreatments
        WHERE BookingId = @BookingId AND IsDelete = 0
          AND (StartTime IS NULL OR ExpiresAt IS NULL OR ExpiresAt <= SYSUTCDATETIME())
    )
        THROW 50003, 'Every treatment needs a time before confirming (a hold may have expired).', 1;

    UPDATE dbo.Bookings
    SET Status = 'Confirmed', UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @BookingId;

    UPDATE dbo.BookingTreatments
    SET ExpiresAt = NULL, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
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
    JOIN dbo.Therapists th ON th.Id = bt.TherapistId
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

    DECLARE @Expired TABLE (LocationId INT, RoomId INT, WorkDate DATE);

    UPDATE bt
    SET RoomId = NULL, TherapistId = NULL, StartTime = NULL, EndTime = NULL, ExpiresAt = NULL,
        UpdatedDate = SYSUTCDATETIME()
    OUTPUT b.LocationId, deleted.RoomId, CAST(deleted.StartTime AS DATE) INTO @Expired
    FROM dbo.BookingTreatments bt
    JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE b.Status = 'Draft' AND bt.IsDelete = 0
      AND bt.ExpiresAt IS NOT NULL AND bt.ExpiresAt <= SYSUTCDATETIME();

    SELECT DISTINCT LocationId, RoomId, WorkDate FROM @Expired;
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

    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.Status
    FROM dbo.Bookings b
    JOIN dbo.Locations l ON l.Id = b.LocationId
    WHERE b.Id = @BookingId AND b.CustomerId = @CustomerId AND b.IsDelete = 0;

    SELECT bt.Id, bt.TreatmentId, t.Name AS TreatmentName, bt.RoomId, bt.TherapistId,
           th.Name AS TherapistName, bt.StartTime, bt.EndTime, bt.ExpiresAt, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt
    JOIN dbo.Treatments t ON t.Id = bt.TreatmentId
    LEFT JOIN dbo.Therapists th ON th.Id = bt.TherapistId
    WHERE bt.BookingId = @BookingId AND bt.IsDelete = 0
    ORDER BY bt.SequenceOrder;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetMine
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.Status
    FROM dbo.Bookings b
    JOIN dbo.Locations l ON l.Id = b.LocationId
    WHERE b.CustomerId = @CustomerId AND b.Status = 'Confirmed' AND b.IsDelete = 0
    ORDER BY b.Id DESC;

    SELECT bt.BookingId, bt.TreatmentId, t.Name AS TreatmentName, bt.TherapistId,
           th.Name AS TherapistName, bt.StartTime, bt.EndTime, bt.SequenceOrder, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt
    JOIN dbo.Treatments t ON t.Id = bt.TreatmentId
    JOIN dbo.Bookings b ON b.Id = bt.BookingId
    LEFT JOIN dbo.Therapists th ON th.Id = bt.TherapistId
    WHERE b.CustomerId = @CustomerId AND b.Status = 'Confirmed' AND b.IsDelete = 0 AND bt.IsDelete = 0;
END
GO

-- Shared by self-registration (Role='Customer', @CreatedBy=NULL) and admin-created staff
-- logins (Role='SuperAdmin'/'Admin'/'Manager'/'Therapist', @CreatedBy=the admin's user id).
CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreateUser
    @Name          NVARCHAR(200),
    @Email         NVARCHAR(256),
    @PasswordHash  VARBINARY(256),
    @PasswordSalt  VARBINARY(128),
    @Phone         NVARCHAR(30) = NULL,
    @Role          VARCHAR(20) = 'Customer',
    @ChainId       INT = NULL,
    @LocationId    INT = NULL,
    @TherapistId   INT = NULL,
    @CreatedBy     INT = NULL, -- NULL for self-registration (no logged-in user yet)
    @UserId        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @Email AND IsDelete = 0)
        THROW 50010, 'Email already registered.', 1;

    INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Phone, Role, ChainId, LocationId, TherapistId, CreatedBy)
    VALUES (@Name, @Email, @PasswordHash, @PasswordSalt, @Phone, @Role, @ChainId, @LocationId, @TherapistId, @CreatedBy);

    SET @UserId = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetUserByEmail
    @Email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Email, PasswordHash, PasswordSalt, Role, ChainId, LocationId, TherapistId, IsEmulator
    FROM dbo.Users
    WHERE Email = @Email AND IsDelete = 0 AND IsActive = 1;
END
GO

-- Backs the emulation exchange (sp_Auth_EmulateCustomer is called from AuthService, not here directly):
-- looks up the emulating staff member (to check IsEmulator) and the target customer, both by id.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetUserById
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Email, PasswordHash, PasswordSalt, Role, ChainId, LocationId, TherapistId, IsEmulator
    FROM dbo.Users
    WHERE Id = @Id AND IsDelete = 0 AND IsActive = 1;
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
    INSERT INTO dbo.RefreshTokens (UserId, TokenHash, ExpiresAt)
    VALUES (@UserId, @TokenHash, @ExpiresAt);

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
           u.Name, u.Email, u.Role, u.ChainId, u.LocationId, u.TherapistId, u.IsEmulator
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
    @ChainId     INT = NULL,
    @LocationId  INT = NULL,
    @TherapistId INT = NULL,
    @IsEmulator  BIT = 0,
    @IsActive    BIT,
    @UpdatedBy   INT
AS
BEGIN
    SET NOCOUNT ON;
    -- AdminAccess keeps Therapist/Customer rows out of this proc's caller, but that's a "which
    -- endpoint" gate, not a "which row" one -- nothing stops the request body itself from setting
    -- @IsEmulator=1 on a Therapist row. Enforced here instead of trusting the caller: IsEmulator can
    -- only ever be true for SuperAdmin/Admin/Manager (mirrors AuthService.EmulatorEligibleRoles),
    -- so login's CanEmulate and the emulate exchange's authorization stay consistent no matter what
    -- was requested.
    UPDATE dbo.Users
    SET Name = @Name, Phone = @Phone, ChainId = @ChainId, LocationId = @LocationId,
        TherapistId = @TherapistId,
        IsEmulator = CASE WHEN Role IN ('SuperAdmin', 'Admin', 'Manager') THEN @IsEmulator ELSE 0 END,
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
    SELECT Id, Name, IsActive
    FROM dbo.SaloonChains
    WHERE IsDelete = 0 AND (@ChainId IS NULL OR Id = @ChainId)
    ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetLocations
    @ChainId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, ChainId, Name, Address, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId, IsActive
    FROM dbo.Locations
    WHERE ChainId = @ChainId AND IsDelete = 0
    ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Admin_GetTreatments
    @ChainId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.Id, t.CategoryId, tc.Name AS CategoryName, t.Name, t.Price, t.DurationSlots, t.IsActive
    FROM dbo.Treatments t
    JOIN dbo.TreatmentCategories tc ON tc.Id = t.CategoryId
    WHERE t.ChainId = @ChainId AND t.IsDelete = 0
    ORDER BY tc.Name, t.Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateChain
    @Name      NVARCHAR(200),
    @CreatedBy INT,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.SaloonChains (Name, CreatedBy) VALUES (@Name, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateChain
    @Id        INT,
    @Name      NVARCHAR(200),
    @IsActive  BIT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SaloonChains
    SET Name = @Name, IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
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
    @WorkingDaysMask TINYINT,
    @TimeZoneId      NVARCHAR(100) = 'UTC',
    @CreatedBy       INT,
    @Id              INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Locations (ChainId, Name, Address, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId, CreatedBy)
    VALUES (@ChainId, @Name, @Address, @OpenTime, @CloseTime, @WorkingDaysMask, @TimeZoneId, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateLocation
    @Id              INT,
    @Name            NVARCHAR(200),
    @Address         NVARCHAR(400) = NULL,
    @OpenTime        TIME,
    @CloseTime       TIME,
    @WorkingDaysMask TINYINT,
    @TimeZoneId      NVARCHAR(100),
    @IsActive        BIT,
    @UpdatedBy       INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Locations
    SET Name = @Name, Address = @Address, OpenTime = @OpenTime, CloseTime = @CloseTime,
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
    @ChainId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, ChainId, Name
    FROM dbo.TreatmentCategories
    WHERE ChainId = @ChainId AND IsDelete = 0 AND IsActive = 1
    ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateTreatmentCategory
    @ChainId   INT,
    @Name      NVARCHAR(200),
    @CreatedBy INT,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.TreatmentCategories (ChainId, Name, CreatedBy) VALUES (@ChainId, @Name, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateTreatment
    @ChainId       INT,
    @CategoryId    INT,
    @Name          NVARCHAR(200),
    @Price         DECIMAL(10,2),
    @DurationSlots SMALLINT,
    @CreatedBy     INT,
    @Id            INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Treatments (ChainId, CategoryId, Name, Price, DurationSlots, CreatedBy)
    VALUES (@ChainId, @CategoryId, @Name, @Price, @DurationSlots, @CreatedBy);
    SET @Id = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UpdateTreatment
    @Id            INT,
    @CategoryId    INT,
    @Name          NVARCHAR(200),
    @Price         DECIMAL(10,2),
    @DurationSlots SMALLINT,
    @IsActive      BIT,
    @UpdatedBy     INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Treatments
    SET CategoryId = @CategoryId, Name = @Name, Price = @Price, DurationSlots = @DurationSlots,
        IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50023, 'Treatment not found.', 1;
END
GO

-- Upsert: a treatment must be explicitly offered at a location (via LocationTreatments) before it
-- shows up in sp_Catalog_GetTreatments/booking availability -- this is how an admin turns that on,
-- optionally overriding the chain-wide price for this location.
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_AssignTreatmentToLocation
    @LocationId    INT,
    @TreatmentId   INT,
    @PriceOverride DECIMAL(10,2) = NULL,
    @CreatedBy     INT
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.LocationTreatments AS target
    USING (SELECT @LocationId AS LocationId, @TreatmentId AS TreatmentId) AS src
        ON target.LocationId = src.LocationId AND target.TreatmentId = src.TreatmentId
    WHEN MATCHED THEN
        UPDATE SET PriceOverride = @PriceOverride, IsActive = 1, IsDelete = 0,
                   UpdatedBy = @CreatedBy, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (LocationId, TreatmentId, PriceOverride, CreatedBy)
        VALUES (@LocationId, @TreatmentId, @PriceOverride, @CreatedBy);
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_UnassignTreatmentFromLocation
    @LocationId  INT,
    @TreatmentId INT,
    @UpdatedBy   INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.LocationTreatments
    SET IsActive = 0, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE LocationId = @LocationId AND TreatmentId = @TreatmentId;
END
GO

-------------------------------------------------------------------------------------------------
-- Therapists / Rooms
-------------------------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetTherapists
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, IsActive FROM dbo.Therapists WHERE IsDelete = 0 ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_CreateTherapist
    @Name      NVARCHAR(200),
    @CreatedBy INT,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Therapists (Name, CreatedBy) VALUES (@Name, @CreatedBy);
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
    UPDATE dbo.Therapists
    SET Name = @Name, IsActive = @IsActive, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50024, 'Therapist not found.', 1;
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
    INSERT INTO dbo.Rooms (LocationId, Name, CreatedBy) VALUES (@LocationId, @Name, @CreatedBy);
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

    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.CustomerId, c.Name AS CustomerName,
           c.Email AS CustomerEmail, b.Status
    FROM dbo.Bookings b
    JOIN dbo.Locations l ON l.Id = b.LocationId
    JOIN dbo.Users c ON c.Id = b.CustomerId
    WHERE b.LocationId = @LocationId AND b.IsDelete = 0
      AND EXISTS (
          SELECT 1 FROM dbo.BookingTreatments bt
          WHERE bt.BookingId = b.Id AND bt.IsDelete = 0 AND CAST(bt.StartTime AS DATE) = @WorkDate
      )
    ORDER BY b.Id;

    SELECT bt.BookingId, bt.TreatmentId, t.Name AS TreatmentName, r.Name AS RoomName,
           bt.TherapistId, th.Name AS TherapistName, bt.StartTime, bt.EndTime,
           bt.SequenceOrder, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt
    JOIN dbo.Treatments t ON t.Id = bt.TreatmentId
    JOIN dbo.Bookings b ON b.Id = bt.BookingId
    LEFT JOIN dbo.Rooms r ON r.Id = bt.RoomId
    LEFT JOIN dbo.Therapists th ON th.Id = bt.TherapistId
    WHERE b.LocationId = @LocationId AND b.IsDelete = 0 AND bt.IsDelete = 0
      AND CAST(bt.StartTime AS DATE) = @WorkDate
    ORDER BY bt.StartTime;
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

-- Admin-as-customer emulation. Run after 01-07. See docs/initial-project-spec.md: "Super Admin/
-- Admin/Manager can be marked as emulator. emulator can emulate customer and access customer
-- portal on behalf of him."

-- Powers the admin-portal "Customers" picker used to start an emulation session -- search only,
-- no admin listing-all-customers use case exists yet so this always requires @Search.
CREATE OR ALTER PROCEDURE dbo.sp_Admin_SearchCustomers
    @Search NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (20) Id, Name, Email, Phone
    FROM dbo.Users
    WHERE Role = 'Customer' AND IsDelete = 0 AND IsActive = 1
      AND (Name LIKE '%' + @Search + '%' OR Email LIKE '%' + @Search + '%')
    ORDER BY Name;
END
GO

-- Staff scheduling: therapist shift assignments + room-category openings, for the admin portal's
-- Scheduling page (Admin/Manager -- see docs/architecture.md's "Shift/room-assignment CRUD" gap).
-- Reuses dbo.ShiftAssignments/dbo.RoomCategoryAssignments, which existed as schema only until now
-- (seeded manually via 06_seed.sql, read only by sp_Booking_GetAvailabilityData for slot math).
-- Run after 01-08.

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetRoster
    @LocationId INT,
    @WorkDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    SELECT sa.Id, sa.TherapistId, th.Name AS TherapistName, sa.ShiftType, sa.StartTime, sa.EndTime
    FROM dbo.ShiftAssignments sa
    JOIN dbo.Therapists th ON th.Id = sa.TherapistId
    WHERE sa.LocationId = @LocationId AND sa.WorkDate = @WorkDate AND sa.IsDelete = 0
    ORDER BY sa.ShiftType, th.Name;

    SELECT rca.Id, rca.RoomId, r.Name AS RoomName, rca.TreatmentCategoryId, tc.Name AS CategoryName, rca.ShiftType
    FROM dbo.RoomCategoryAssignments rca
    JOIN dbo.Rooms r ON r.Id = rca.RoomId
    JOIN dbo.TreatmentCategories tc ON tc.Id = rca.TreatmentCategoryId
    WHERE r.LocationId = @LocationId AND rca.WorkDate = @WorkDate AND rca.IsDelete = 0
    ORDER BY rca.ShiftType, r.Name;
END
GO

-- Upsert keyed on UQ_ShiftAssignments_Location_Therapist_Shift_Date: re-assigning the same
-- therapist to the same location/shift/date just updates the times and revives a removed row.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_AssignTherapistShift
    @LocationId  INT,
    @TherapistId INT,
    @ShiftType   VARCHAR(10),
    @WorkDate    DATE,
    @StartTime   TIME,
    @EndTime     TIME,
    @CreatedBy   INT,
    @Id          INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.ShiftAssignments AS target
    USING (SELECT @LocationId AS LocationId, @TherapistId AS TherapistId, @ShiftType AS ShiftType, @WorkDate AS WorkDate) AS src
        ON target.LocationId = src.LocationId AND target.TherapistId = src.TherapistId
           AND target.ShiftType = src.ShiftType AND target.WorkDate = src.WorkDate
    WHEN MATCHED THEN
        UPDATE SET StartTime = @StartTime, EndTime = @EndTime, IsActive = 1, IsDelete = 0,
                   UpdatedBy = @CreatedBy, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (LocationId, TherapistId, ShiftType, WorkDate, StartTime, EndTime, CreatedBy)
        VALUES (@LocationId, @TherapistId, @ShiftType, @WorkDate, @StartTime, @EndTime, @CreatedBy);

    SELECT @Id = Id FROM dbo.ShiftAssignments
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

    SELECT @Id = Id FROM dbo.RoomCategoryAssignments
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

-- Self-service profile management (any logged-in role) -- name/phone editing and a profile photo,
-- backed by dbo.StaffProfiles/dbo.CustomerProfiles (see 01_tables.sql). Run after 01-09.

CREATE OR ALTER PROCEDURE dbo.sp_Profile_GetStaff
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Name, u.Email, u.Phone, u.Role, sp.PhotoPath
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
    SELECT u.Id, u.Name, u.Email, u.Phone, u.Role, cp.PhotoPath
    FROM dbo.Users u
    LEFT JOIN dbo.CustomerProfiles cp ON cp.UserId = u.Id
    WHERE u.Id = @UserId AND u.IsDelete = 0;
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
    MERGE dbo.CustomerProfiles AS target
    USING (SELECT @UserId AS UserId) AS src ON target.UserId = src.UserId
    WHEN MATCHED THEN
        UPDATE SET PhotoPath = @PhotoPath, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, PhotoPath, UpdatedDate) VALUES (@UserId, @PhotoPath, SYSUTCDATETIME());
END
GO
