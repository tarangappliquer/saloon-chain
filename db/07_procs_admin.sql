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

CREATE OR ALTER PROCEDURE dbo.sp_Booking_GetForLocation
    @LocationId INT,
    @WorkDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.Id, b.LocationId, l.Name AS LocationName, b.RoomId, r.Name AS RoomName,
           b.TherapistId, th.Name AS TherapistName, b.CustomerId, c.Name AS CustomerName, c.Email AS CustomerEmail,
           b.StartTime, b.EndTime, b.Status
    FROM dbo.Bookings b
    JOIN dbo.Locations l ON l.Id = b.LocationId
    JOIN dbo.Rooms r ON r.Id = b.RoomId
    JOIN dbo.Therapists th ON th.Id = b.TherapistId
    JOIN dbo.Users c ON c.Id = b.CustomerId
    WHERE b.LocationId = @LocationId AND CAST(b.StartTime AS DATE) = @WorkDate AND b.IsDelete = 0
    ORDER BY b.StartTime;

    SELECT bt.BookingId, bt.TreatmentId, t.Name AS TreatmentName, bt.SequenceOrder, bt.SlotCount, bt.Price
    FROM dbo.BookingTreatments bt
    JOIN dbo.Treatments t ON t.Id = bt.TreatmentId
    JOIN dbo.Bookings b ON b.Id = bt.BookingId
    WHERE b.LocationId = @LocationId AND CAST(b.StartTime AS DATE) = @WorkDate AND b.IsDelete = 0 AND bt.IsDelete = 0;
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
    WHERE Id = @BookingId AND IsDelete = 0 AND Status IN ('Held', 'Confirmed');

    IF @@ROWCOUNT = 0
        THROW 50004, 'Booking not found.', 1;

    SELECT LocationId, RoomId, CAST(StartTime AS DATE) AS WorkDate FROM dbo.Bookings WHERE Id = @BookingId;
END
GO
