-- Run order: 01_tables -> 02_types -> 03_procs_catalog -> 04_procs_booking -> 05_procs_auth -> 06_seed -> 07_procs_admin -> 08_procs_emulation -> 09_procs_scheduling -> 10_procs_profile
-- Target: an existing SQL Server database (create one first, e.g. CREATE DATABASE SaloonChains;)

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Every table carries the same 6 audit columns: IsDelete (soft-delete flag; nothing sets it yet --
-- no delete feature exists, but SELECT procs already filter on it), IsActive, CreatedBy/CreatedDate,
-- UpdatedBy/UpdatedDate. CreatedBy/UpdatedBy are the current logged-in user's id (ICurrentUser,
-- passed in from C# as @CreatedBy/@UpdatedBy) and FK to dbo.Users -- nullable, because system/
-- driven updates (e.g. the hold-expiry sweep) and self-registration (no user yet at the moment the
-- Users row itself is created) have no logged-in user.

CREATE TABLE dbo.SaloonChains (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    BreakStartTime TIME NULL,
    BreakEndTime   TIME NULL,
    StaffEarlyArrivalMinutes INT NOT NULL DEFAULT 30,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);

CREATE TABLE dbo.Locations (
    Id               INT IDENTITY(1,1) PRIMARY KEY,
    ChainId          INT NOT NULL REFERENCES dbo.SaloonChains(Id),
    Name             NVARCHAR(200) NOT NULL,
    Address          NVARCHAR(400) NULL,
    -- geography::Point(lat, long, 4326); NULL until an admin sets it via the map picker. Stored as
    -- GEOGRAPHY (not separate Latitude/Longitude columns) so a future "nearest location" query can
    -- use STDistance()/the spatial index below instead of a Haversine calc in application code.
    -- sp_Catalog_CreateLocation/sp_Catalog_UpdateLocation still take @Latitude/@Longitude decimals in
    -- and build the point server-side; sp_Catalog_GetLocations/sp_Admin_GetLocations extract .Lat/.Long
    -- back out -- the C# layer never touches SqlGeography directly.
    Coordinates      GEOGRAPHY NULL,
    OpenTime         TIME NOT NULL,
    CloseTime        TIME NOT NULL,
    BreakStartTime   TIME NULL,
    BreakEndTime     TIME NULL,
    WorkingDaysMask  TINYINT NOT NULL, -- bit0=Mon .. bit6=Sun
    TimeZoneId       NVARCHAR(100) NOT NULL DEFAULT 'UTC',
    StaffEarlyArrivalMinutes INT NULL, -- NULL = inherit from SaloonChains
    IsDelete         BIT NOT NULL DEFAULT 0,
    IsActive         BIT NOT NULL DEFAULT 1,
    CreatedBy        INT NULL,
    CreatedDate      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy        INT NULL,
    UpdatedDate      DATETIME2 NULL
);
CREATE SPATIAL INDEX SIX_Locations_Coordinates ON dbo.Locations(Coordinates) USING GEOGRAPHY_AUTO_GRID;

-- One-off closures (public holidays, maintenance days) on top of the weekly WorkingDaysMask.
CREATE TABLE dbo.LocationHolidays (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    HolidayDate  DATE NOT NULL,
    Reason       NVARCHAR(200) NULL,
    Type         VARCHAR(20) NOT NULL DEFAULT 'Holiday',
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);
-- Filtered (not a plain UNIQUE constraint) so a soft-deleted (re-opened) closure never blocks
-- re-closing the same date -- sp_Admin_CreateLocationClosures only checks IsDelete=0 rows for
-- duplicates, so an unfiltered constraint would raw-SQL-error on any date that was ever closed then
-- removed.
CREATE UNIQUE INDEX UQ_LocationHolidays_Location_Date ON dbo.LocationHolidays(LocationId, HolidayDate) WHERE IsDelete = 0;

-- Effective-dated per-day-of-week hours, same pattern as dbo.TreatmentPrices/TreatmentDurations: a
-- day's hours as of any date is the row with the latest EffectiveFrom <= that date (see
-- sp_Catalog_GetLocationDaySchedule). Locations.OpenTime/CloseTime remain the fallback used for a
-- (LocationId, DayBit) that has no scheduled override yet -- most locations never need this table at
-- all. DayBit matches Locations.WorkingDaysMask's bit scheme (bit0=Mon..bit6=Sun) -- WorkingDaysMask
-- still alone decides whether a day is open at all; this table only ever supplies that day's hours.
CREATE TABLE dbo.LocationDaySchedule (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    LocationId     INT NOT NULL REFERENCES dbo.Locations(Id),
    DayBit         TINYINT NOT NULL CHECK (DayBit IN (1, 2, 4, 8, 16, 32, 64)),
    -- NULL when IsClosed = 1 -- a closed override has no hours to store.
    OpenTime       TIME NULL,
    CloseTime      TIME NULL,
    IsClosed       BIT NOT NULL DEFAULT 0,
    EffectiveFrom  DATE NOT NULL,
    -- NULL = open-ended (stays in effect until superseded by a later row). Non-null pins the
    -- override to a single date (EffectiveFrom = EffectiveTo) or a bounded date range.
    EffectiveTo    DATE NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL,
    CONSTRAINT CK_LocationDaySchedule_Times CHECK (IsClosed = 1 OR (OpenTime IS NOT NULL AND CloseTime IS NOT NULL AND CloseTime > OpenTime)),
    CONSTRAINT CK_LocationDaySchedule_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
CREATE INDEX IX_LocationDaySchedule_Location_Day_EffectiveFrom ON dbo.LocationDaySchedule(LocationId, DayBit, EffectiveFrom DESC);
-- One scheduled entry per location+day+effective date -- filtered so a cancelled (soft-deleted)
-- entry never blocks re-scheduling the same date.
CREATE UNIQUE INDEX UQ_LocationDaySchedule_Location_Day_EffectiveFrom ON dbo.LocationDaySchedule(LocationId, DayBit, EffectiveFrom) WHERE IsDelete = 0;

CREATE TABLE dbo.Rooms (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    Name         NVARCHAR(100) NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);

-- LocationId, not ChainId -- a category (and every treatment under it) belongs to exactly one
-- location, not the whole chain. There is no chain-wide catalog assigned out to locations
-- anymore (that was dbo.LocationTreatments, now removed): creating a treatment here directly
-- offers it at the location it was created for.
CREATE TABLE dbo.TreatmentCategories (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    Name         NVARCHAR(200) NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_TreatmentCategories_LocationId ON dbo.TreatmentCategories(LocationId) WHERE IsDelete = 0;

CREATE TABLE dbo.Treatments (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    LocationId     INT NOT NULL REFERENCES dbo.Locations(Id),
    CategoryId     INT NOT NULL REFERENCES dbo.TreatmentCategories(Id),
    Name           NVARCHAR(200) NOT NULL,
    Description    NVARCHAR(2000) NULL,
    -- Gates client-portal visibility/bookability independently of price (see sp_Catalog_GetTreatments) --
    -- a treatment can exist and be priced ahead of when it should actually go live.
    EffectiveFrom  DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    IsDelete       BIT NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL
);
-- Every hot-path catalog query filters by LocationId (sp_Catalog_Search, sp_Catalog_GetTreatments,
-- sp_Admin_GetTreatments, plus the availability-cache warm-up) with no other index to fall back on
-- -- unlike TreatmentPrices/TreatmentDurations below, this table had no LocationId index at all.
CREATE INDEX IX_Treatments_LocationId ON dbo.Treatments(LocationId) WHERE IsDelete = 0;

-- Effective-dated price list: a treatment's price as of any date is the row with the latest
-- EffectiveFrom <= that date (see sp_Catalog_GetTreatments etc). A price change normally inserts a
-- new row so past bookings/history stay reconstructable -- in-place UPDATE (sp_Catalog_UpdateTreatmentPrice)
-- is only allowed while no booking has yet relied on that row (see its own comment).
CREATE TABLE dbo.TreatmentPrices (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
    Price          DECIMAL(10,2) NOT NULL,
    EffectiveFrom  DATE NOT NULL,
    -- NULL = open-ended. Non-null pins the price to a single date or a bounded date range, after
    -- which resolution falls back to whichever row has the next-latest EffectiveFrom <= that date.
    EffectiveTo    DATE NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL,
    CONSTRAINT CK_TreatmentPrices_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
CREATE INDEX IX_TreatmentPrices_TreatmentId_EffectiveFrom ON dbo.TreatmentPrices(TreatmentId, EffectiveFrom DESC);
-- One price per treatment per effective date -- filtered so a soft-deleted (corrected) entry never
-- blocks re-scheduling the same date.
CREATE UNIQUE INDEX UQ_TreatmentPrices_Treatment_EffectiveFrom ON dbo.TreatmentPrices(TreatmentId, EffectiveFrom) WHERE IsDelete = 0;

-- Effective-dated duration list: a treatment's duration slots (units of 5 min) as of any date is
-- the row with the latest EffectiveFrom <= that date.
CREATE TABLE dbo.TreatmentDurations (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
    DurationSlots  SMALLINT NOT NULL CHECK (DurationSlots > 0),
    -- Minutes the customer must arrive before the appointment's actual start time. 0 (default) means
    -- no arrival buffer -- most treatments don't need one.
    PreTimeMinutes SMALLINT NOT NULL DEFAULT 0 CHECK (PreTimeMinutes >= 0),
    EffectiveFrom  DATE NOT NULL,
    -- NULL = open-ended, same convention as TreatmentPrices.EffectiveTo.
    EffectiveTo    DATE NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL,
    CONSTRAINT CK_TreatmentDurations_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
CREATE INDEX IX_TreatmentDurations_TreatmentId_EffectiveFrom ON dbo.TreatmentDurations(TreatmentId, EffectiveFrom DESC);
CREATE UNIQUE INDEX UQ_TreatmentDurations_Treatment_EffectiveFrom ON dbo.TreatmentDurations(TreatmentId, EffectiveFrom) WHERE IsDelete = 0;

-- ChainId/LocationId/UserId mirror the scope of whichever dbo.Users row currently links to this
-- profile (see AdminStaffEndpoints -- kept in sync on staff create/update, not user-editable
-- directly) -- all nullable, since a profile can exist unlinked (created standalone from the
-- Therapists page, not yet assigned to a staff login).
CREATE TABLE dbo.TherapistProfile (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    ChainId      INT NULL REFERENCES dbo.SaloonChains(Id),
    LocationId   INT NULL REFERENCES dbo.Locations(Id),
    UserId       INT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);

-- Single login table for every kind of user -- RootSuperAdmin, SuperAdmin, Admin, Manager,
-- Receptionist, Therapist, Other and Customer all authenticate the same way (see
-- sp_Auth_CreateUser/GetUserByEmail) and are told apart only by Role plus the scoping columns
-- below. ChainId/LocationId/TherapistId are deliberately all nullable and mostly mutually
-- exclusive by convention (not enforced -- one column set depends on Role, e.g. RootSuperAdmin has
-- none set, SuperAdmin/Admin set ChainId, Manager/Receptionist/Therapist/Other set LocationId).
-- There is exactly one chain row in practice (single-saloon product decision) but ChainId/
-- SaloonChains stay in the schema so a second chain is a data change, not a schema migration, if
-- multi-tenant is ever needed again:
--   RootSuperAdmin: no scope columns set -- the platform owner; only role that can create chains/
--                 locations for a chain and provision a chain's first SuperAdmin/Admin (see
--                 AdminStaffEndpoints.MapPost, Program.cs's ChainManagement policy). Seeded at
--                 startup by AdminSeeder -- there is no bootstrap workflow for any other role.
--   SuperAdmin:   ChainId set -- scoped to one chain, all its locations; the top of that chain's
--                 own staff hierarchy (created by RootSuperAdmin).
--   Admin:        ChainId set -- scoped to one chain, all its locations; created by RootSuperAdmin
--                 or that chain's SuperAdmin.
--   Manager:      LocationId set -- runs a single location day to day, ranks above Receptionist in
--                 the staff-creation hierarchy (see AdminStaffEndpoints.MapPost).
--   Receptionist: LocationId set -- front-desk staff scoped to a single location; no staff-creation
--                 rights of its own.
--   Therapist:    LocationId + TherapistId set -- login tied 1:1 to a TherapistProfile row, for staff who
--                 need to see their own schedule; TherapistId is what ShiftAssignments/Bookings key on.
--   Other:        LocationId set (optional) -- catch-all for staff that don't fit the above (e.g.
--                 cleaner, cashier); no admin-portal management capability beyond StaffAccess.
--   Customer:     no scope columns set -- self-registered, or created by RootSuperAdmin/SuperAdmin/
--                 Admin on a customer's behalf (Manager cannot create a customer, see
--                 AdminCustomersEndpoints' CustomerManagement policy). Any staff role can also be
--                 marked IsEmulator to act as a customer (see below).
CREATE TABLE dbo.Users (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    Name          NVARCHAR(200)   NOT NULL,
    Email         NVARCHAR(256)   NOT NULL UNIQUE,
    PasswordHash  VARBINARY(256)  NOT NULL,
    PasswordSalt  VARBINARY(128)  NOT NULL,
    Phone         NVARCHAR(30)    NULL,
    -- Web-relative path under /uploads/profile-photos, not a filesystem path. Lives directly on Users
    -- for a Customer (see sp_Profile_*Customer*) -- dbo.StaffProfiles.PhotoPath is still the source
    -- for staff roles, unchanged.
    ProfilePhoto  NVARCHAR(500)   NULL,
    Role          VARCHAR(20)     NOT NULL DEFAULT 'Customer'
                  CHECK (Role IN ('RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other', 'Customer')),
    ChainId       INT NULL REFERENCES dbo.SaloonChains(Id),
    LocationId    INT NULL REFERENCES dbo.Locations(Id),
    TherapistId   INT NULL REFERENCES dbo.TherapistProfile(Id),
    JoiningDate   DATE NULL, -- staff only (Customer rows leave this NULL); set at creation, defaults to today in the admin portal form
    IsCustomer    AS (CASE WHEN Role = 'Customer' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END),
    IsEmulator    BIT NOT NULL DEFAULT 0, -- any staff role (RootSuperAdmin/SuperAdmin/Admin/Manager/Receptionist/Therapist/Other): allowed to open a customer session on their behalf (see sp_Auth_EmulateCustomer)
    IsWalkIn      BIT NOT NULL DEFAULT 0, -- flagged when created as a walk-in customer by staff
    StripeCustomerId NVARCHAR(200) NULL,
    IsEmailVerified BIT NOT NULL DEFAULT 0, -- proven only by clicking a change-email confirmation link (sp_Auth_ConfirmEmailChange); no signup-time verification exists yet.
    IsDelete      BIT NOT NULL DEFAULT 0,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedBy     INT NULL REFERENCES dbo.Users(Id),
    CreatedDate   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy     INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate   DATETIME2 NULL
);

-- Opaque, rotating refresh tokens for /api/auth/refresh: only the SHA-256 hash is stored, never the
-- raw token, so a DB read can't be replayed as a live credential. Rotation (one-time use) means a
-- stolen-and-replayed token is caught the moment the legitimate client refreshes next -- both rows
-- end up revoked, forcing a re-login instead of leaving a duplicate live session silently active.
CREATE TABLE dbo.RefreshTokens (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    UserId       INT NOT NULL REFERENCES dbo.Users(Id),
    TokenHash    VARBINARY(32) NOT NULL UNIQUE,
    ExpiresAt    DATETIME2 NOT NULL,
    RevokedDate  DATETIME2 NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_RefreshTokens_UserId ON dbo.RefreshTokens(UserId);

-- Same opaque/hashed/single-use shape as dbo.RefreshTokens above, for /api/auth/forgot-password +
-- /reset-password and for the "set your password" link sent when an admin creates a staff/customer
-- account with no admin-chosen password (see AuthService.CreateStaffAsync/CreateCustomerAsync).
-- ResetDate NULL = still redeemable, non-null = already used.
CREATE TABLE dbo.PasswordResetTokens (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    UserId       INT NOT NULL REFERENCES dbo.Users(Id),
    TokenHash    VARBINARY(32) NOT NULL UNIQUE,
    ExpiresAt    DATETIME2 NOT NULL,
    ResetDate    DATETIME2 NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_PasswordResetTokens_UserId ON dbo.PasswordResetTokens(UserId);

-- Same opaque/hashed/single-use shape as dbo.PasswordResetTokens above, for the self-service
-- "change email" flow: a change is staged here and only applied to Users.Email once the link
-- mailed to NewEmail is clicked. ConfirmedDate NULL = still redeemable, non-null = already used.
CREATE TABLE dbo.EmailChangeTokens (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    UserId        INT NOT NULL REFERENCES dbo.Users(Id),
    NewEmail      NVARCHAR(256) NOT NULL,
    TokenHash     VARBINARY(32) NOT NULL UNIQUE,
    ExpiresAt     DATETIME2 NOT NULL,
    ConfirmedDate DATETIME2 NULL,
    CreatedDate   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_EmailChangeTokens_UserId ON dbo.EmailChangeTokens(UserId);

ALTER TABLE dbo.SaloonChains ADD CONSTRAINT FK_SaloonChains_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.SaloonChains ADD CONSTRAINT FK_SaloonChains_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.Locations ADD CONSTRAINT FK_Locations_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.Locations ADD CONSTRAINT FK_Locations_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.LocationHolidays ADD CONSTRAINT FK_LocationHolidays_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.LocationHolidays ADD CONSTRAINT FK_LocationHolidays_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.Rooms ADD CONSTRAINT FK_Rooms_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.Rooms ADD CONSTRAINT FK_Rooms_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.TreatmentCategories ADD CONSTRAINT FK_TreatmentCategories_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.TreatmentCategories ADD CONSTRAINT FK_TreatmentCategories_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.Treatments ADD CONSTRAINT FK_Treatments_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.Treatments ADD CONSTRAINT FK_Treatments_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.TherapistProfile ADD CONSTRAINT FK_TherapistProfile_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.TherapistProfile ADD CONSTRAINT FK_TherapistProfile_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(Id);
ALTER TABLE dbo.TherapistProfile ADD CONSTRAINT FK_TherapistProfile_User FOREIGN KEY (UserId) REFERENCES dbo.Users(Id);

CREATE TABLE dbo.ShiftAssignments (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    TherapistId  INT NOT NULL REFERENCES dbo.TherapistProfile(Id),
    -- NULL = legacy/any-room assignment (pre-per-room-assignment rows); every new assignment made
    -- through the admin Scheduling grid always sets this, since staff are now assigned per room.
    RoomId       INT NULL REFERENCES dbo.Rooms(Id),
    ShiftType    VARCHAR(10) NOT NULL CHECK (ShiftType IN ('Morning','Evening')),
    WorkDate     DATE NOT NULL,
    StartTime    TIME NOT NULL,
    EndTime      TIME NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_ShiftAssignments_Location_Date ON dbo.ShiftAssignments(LocationId, WorkDate);
-- A therapist can cover more than one time window in a shift (e.g. 9-2 in Room A, then 3-6 back in
-- Room A once a proxy has covered 2-3 elsewhere), so StartTime is part of the key instead of RoomId:
-- re-submitting the same therapist/shift/date/start updates that window in place (room, end time),
-- while a different start time is a second, separate window for the same therapist. Filtered so a
-- soft-deleted (removed) assignment doesn't block reusing the same window later.
CREATE UNIQUE INDEX UQ_ShiftAssignments_Therapist_Shift_Date_Start
    ON dbo.ShiftAssignments(LocationId, TherapistId, ShiftType, WorkDate, StartTime) WHERE IsDelete = 0;
-- A room can now hold multiple therapists across a shift (primary + a proxy covering part of it),
-- so there is no per-room uniqueness constraint here -- sp_Scheduling_AssignTherapistShift's caller
-- rejects a new assignment whose time range overlaps another therapist's existing one in that room
-- (see SchedulingRepository.HasShiftOverlapAsync), the same app-layer pattern already used for
-- blocked-slot overlap (sp_Scheduling_HasBlockOverlap) instead of a DB constraint.

CREATE TABLE dbo.RoomCategoryAssignments (
    Id                   INT IDENTITY(1,1) PRIMARY KEY,
    RoomId               INT NOT NULL REFERENCES dbo.Rooms(Id),
    TreatmentCategoryId  INT NOT NULL REFERENCES dbo.TreatmentCategories(Id),
    ShiftType            VARCHAR(10) NOT NULL CHECK (ShiftType IN ('Morning','Evening')),
    WorkDate             DATE NOT NULL,
    IsDelete             BIT NOT NULL DEFAULT 0,
    IsActive             BIT NOT NULL DEFAULT 1,
    CreatedBy            INT NULL REFERENCES dbo.Users(Id),
    CreatedDate          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate          DATETIME2 NULL
);
CREATE INDEX IX_RoomCategoryAssignments_Room_Date ON dbo.RoomCategoryAssignments(RoomId, WorkDate);
-- Backs sp_Scheduling_OpenRoom's MERGE upsert -- a room serves one category per shift/date, and
-- filtered (like the index above) so closing a room doesn't block reopening it later.
CREATE UNIQUE INDEX UQ_RoomCategoryAssignments_Room_Shift_Date
    ON dbo.RoomCategoryAssignments(RoomId, ShiftType, WorkDate) WHERE IsDelete = 0;

-- Configurable block types for scheduling non-booking time ranges (Lunch Break, Team Meeting, etc.) --
-- scoped to ChainId (saloon-wide), LocationId (location-specific), or NULL/NULL (system default).
CREATE TABLE dbo.BlockTypes (
    Id                     INT IDENTITY(1,1) PRIMARY KEY,
    Name                   NVARCHAR(100) NOT NULL,
    ChainId                INT NULL REFERENCES dbo.SaloonChains(Id),
    LocationId             INT NULL REFERENCES dbo.Locations(Id),
    IsPaid                 BIT NOT NULL DEFAULT 0, -- Paid vs Unpaid time block
    DefaultDurationMinutes INT NOT NULL DEFAULT 30, -- Default length in minutes (e.g. 15, 30, 45, 60)
    ColorHex               NVARCHAR(10) NOT NULL DEFAULT '#F59E0B',
    IsActive               BIT NOT NULL DEFAULT 1,
    IsDelete               BIT NOT NULL DEFAULT 0,
    CreatedBy              INT NULL REFERENCES dbo.Users(Id),
    CreatedDate            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy              INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate            DATETIME2 NULL,
    CONSTRAINT CK_BlockTypes_Scope CHECK (
        (ChainId IS NULL AND LocationId IS NULL) OR
        (ChainId IS NOT NULL AND LocationId IS NULL) OR
        (LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_BlockTypes_Chain ON dbo.BlockTypes(ChainId) WHERE IsDelete = 0;
CREATE INDEX IX_BlockTypes_Location ON dbo.BlockTypes(LocationId) WHERE IsDelete = 0;

-- Admin-initiated block on a room/time range (lunch break, therapist emergency leave, etc) --
-- distinct from RoomCategoryAssignments (whole room open/closed for a shift) since a block covers
-- an arbitrary sub-range of an otherwise-open, staffed room. Enforced not-overlapping any live
-- booking at insert time (see sp_Scheduling_HasBookingOverlap) -- an already-booked slot can't be
-- blocked, matching the same booking-takes-precedence rule as closing a room/removing a shift.
CREATE TABLE dbo.BlockedSlots (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    RoomId       INT NOT NULL REFERENCES dbo.Rooms(Id),
    BlockTypeId  INT NULL REFERENCES dbo.BlockTypes(Id),
    WorkDate     DATE NOT NULL,
    StartTime    TIME NOT NULL,
    EndTime      TIME NOT NULL,
    Reason       NVARCHAR(200) NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_BlockedSlots_Room_Date ON dbo.BlockedSlots(RoomId, WorkDate) WHERE IsDelete = 0;

-- Saloon-defined progress labels for a Confirmed booking (Arrived, Started, Complete, etc) --
-- independent of Bookings.Status below, which is the fixed booking lifecycle (Draft/Confirmed/
-- Cancelled/NoShow). Same Chain/Location scoping and colour-badge shape as dbo.BlockTypes above.
CREATE TABLE dbo.AppointmentStatuses (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(50) NOT NULL,
    ChainId      INT NULL REFERENCES dbo.SaloonChains(Id),
    LocationId   INT NULL REFERENCES dbo.Locations(Id),
    ColorHex     NVARCHAR(10) NOT NULL DEFAULT '#3B82F6',
    SortOrder    SMALLINT NOT NULL DEFAULT 0,
    -- The one seeded global 'Complete' row below -- fixed terminal status, always sorts last
    -- regardless of SortOrder (sp_Admin_GetAppointmentStatuses orders IsSystem last) and can't be
    -- edited or deleted (sp_Admin_UpdateAppointmentStatus/sp_Admin_DeleteAppointmentStatus reject it).
    IsSystem     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    IsDelete     BIT NOT NULL DEFAULT 0,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL,
    CONSTRAINT CK_AppointmentStatuses_Scope CHECK (
        (ChainId IS NULL AND LocationId IS NULL) OR
        (ChainId IS NOT NULL AND LocationId IS NULL) OR
        (LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_AppointmentStatuses_Chain ON dbo.AppointmentStatuses(ChainId) WHERE IsDelete = 0;
CREATE INDEX IX_AppointmentStatuses_Location ON dbo.AppointmentStatuses(LocationId) WHERE IsDelete = 0;

-- Two global rows (ChainId/LocationId both NULL) are visible to every saloon via the same
-- global-default clause sp_Admin_GetAppointmentStatuses already uses for BlockTypes. SortOrder at
-- the SMALLINT extremes pins Arrived first and Complete last -- sp_Admin_GetAppointmentStatuses
-- orders by plain SortOrder, so every custom status a saloon adds (SortOrder starting at 0) always
-- lands between them without any IsSystem-aware sort logic.
INSERT INTO dbo.AppointmentStatuses (Name, ChainId, LocationId, ColorHex, SortOrder, IsSystem)
VALUES
    ('Arrived', NULL, NULL, '#8B5CF6', -32768, 1),
    ('Complete', NULL, NULL, '#10B981', 32767, 1);

-- Master lookup of cancellation reasons, offered when staff cancel a booking (sp_Booking_CancelAsAdmin).
-- Global only, no chain/location scoping -- unlike BlockTypes/AppointmentStatuses, this is a fixed
-- reference list, not something a saloon customizes.
CREATE TABLE dbo.CancelReasons (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    SortOrder    SMALLINT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    IsDelete     BIT NOT NULL DEFAULT 0,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);
INSERT INTO dbo.CancelReasons (Name, SortOrder) VALUES
    ('No Reason Provided', 0),
    ('Duplicate appointment', 1),
    ('Appointment made by mistake', 2),
    ('Client not available', 3);

-- A booking is a draft/cart container for one or more treatments booked in the same checkout.
-- It carries no schedule itself -- each treatment is scheduled (room/therapist/time) independently
-- on its own BookingTreatments row, so treatments can be picked at different times. 'Draft' covers
-- the whole assembly phase (any mix of scheduled/unscheduled lines; no whole-booking expiry --
-- only individual lines expire, see BookingTreatments.ExpiresAt below).
CREATE TABLE dbo.Bookings (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    CustomerId   INT NOT NULL REFERENCES dbo.Users(Id), -- who the booking is FOR (a Users row with Role='Customer')
    -- NoShow: set only via sp_Booking_MarkNoShow, once a Confirmed booking's own start time has
    -- passed with no check-in -- distinct from Cancelled (a staff/customer decision made ahead of
    -- time) so no-show-rate reporting (sp_Report_NoShowRate) isn't polluted by ordinary cancellations.
    Status       VARCHAR(10) NOT NULL CHECK (Status IN ('Draft','Confirmed','Cancelled','NoShow')),
    -- Computed, not stored state -- always in lockstep with Status (no separate write path to drift
    -- out of sync), just exposed as queryable/filterable flag columns for callers that want
    -- WHERE IsCancelled = 1 / WHERE IsNoShow = 1 instead of a string comparison against Status.
    IsCancelled  AS (CASE WHEN Status = 'Cancelled' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END),
    IsNoShow     AS (CASE WHEN Status = 'NoShow' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END),
    -- Saloon-defined progress label (Arrived/Started/Complete...) -- only meaningful once Status =
    -- 'Confirmed'; set/cleared via sp_Booking_SetAppointmentStatus, never implied by Status itself.
    AppointmentStatusId INT NULL REFERENCES dbo.AppointmentStatuses(Id),
    -- Only set by sp_Booking_CancelAsAdmin when Status transitions to 'Cancelled'; NULL otherwise.
    CancelReasonId INT NULL REFERENCES dbo.CancelReasons(Id),
    RowVersion   ROWVERSION,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id), -- who created the row (self for customer bookings;
                                                     -- staff when booked on a customer's behalf)
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_Bookings_CustomerId ON dbo.Bookings(CustomerId);
-- Location-scoped dashboard/reporting reads (sp_Admin_GetDashboardStats, sp_Booking_GetForLocation)
-- filter by LocationId + Status/CreatedDate -- without this, those queries fall back to scanning
-- every non-deleted booking regardless of location.
CREATE INDEX IX_Bookings_LocationId ON dbo.Bookings(LocationId) INCLUDE (Status, CreatedDate) WHERE IsDelete = 0;
-- sp_Admin_GetDashboardStats' "unscheduled Draft, fell back to CreatedDate" branch filters
-- Bookings by CreatedDate directly, with no LocationId in the predicate to seek on instead.
CREATE INDEX IX_Bookings_CreatedDate ON dbo.Bookings(CreatedDate) INCLUDE (LocationId, CustomerId, Status) WHERE IsDelete = 0;

-- One row per treatment in a booking. RoomId/TherapistId/StartTime/EndTime/ExpiresAt stay NULL
-- until that treatment's slot is picked -- each treatment gets its own independent time AND its
-- own 5-minute hold clock, so picking/expiring/re-picking one treatment never touches another's.
CREATE TABLE dbo.BookingTreatments (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    BookingId      INT NOT NULL REFERENCES dbo.Bookings(Id) ON DELETE CASCADE,
    TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
    RoomId         INT NULL REFERENCES dbo.Rooms(Id),
    TherapistId    INT NULL REFERENCES dbo.TherapistProfile(Id),
    StartTime      DATETIME2 NULL,
    EndTime        DATETIME2 NULL,
    ExpiresAt      DATETIME2 NULL,
    SequenceOrder  SMALLINT NOT NULL,
    SlotCount      SMALLINT NOT NULL,
    Price          DECIMAL(10,2) NOT NULL,
    -- Which TreatmentPrices row Price was captured from -- NULL for rows created before this column
    -- existed. Lets sp_Catalog_UpdateTreatmentPrice check "has any booking used this exact price
    -- row" directly instead of inferring it from dates.
    TreatmentPriceId INT NULL REFERENCES dbo.TreatmentPrices(Id),
    TreatmentDurationId INT NULL REFERENCES dbo.TreatmentDurations(Id),
    ProxyTherapistId INT NULL REFERENCES dbo.Users(Id),
    IsDelete       BIT NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedBy      INT NULL REFERENCES dbo.Users(Id),
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate    DATETIME2 NULL
);
CREATE INDEX IX_BookingTreatments_BookingId ON dbo.BookingTreatments(BookingId);
CREATE INDEX IX_BookingTreatments_RoomId_StartTime ON dbo.BookingTreatments(RoomId, StartTime) INCLUDE (EndTime, ExpiresAt);
CREATE INDEX IX_BookingTreatments_TherapistId_StartTime ON dbo.BookingTreatments(TherapistId, StartTime) INCLUDE (EndTime, ExpiresAt);
-- Date-range dashboard/reporting reads (sp_Admin_GetDashboardStats) filter and sort by StartTime
-- alone, with no RoomId/TherapistId predicate to anchor on -- neither index above leads with
-- StartTime, so those reads would still force a full scan without this one.
CREATE INDEX IX_BookingTreatments_StartTime ON dbo.BookingTreatments(StartTime) INCLUDE (BookingId, EndTime, Price) WHERE IsDelete = 0;

-- Per-day staff attendance tracking (Arrival & Departure/Left times).
-- Immutable once ArrivalTime or LeftTime is set by Receptionist/Admin/SuperAdmin.
CREATE TABLE dbo.StaffAttendance (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    UserId       INT NOT NULL REFERENCES dbo.Users(Id),
    WorkDate     DATE NOT NULL,
    ArrivalTime  TIME NULL,
    LeftTime     TIME NULL,
    CreatedBy    INT NOT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);
CREATE UNIQUE INDEX UX_StaffAttendance_Location_User_Date ON dbo.StaffAttendance(LocationId, UserId, WorkDate);

-- 1:1 extension of dbo.Users, split by Staff/Customer per the two roles' very different concerns
-- (a Customer's profile is self-managed and minimal; a Staff profile could grow admin-managed
-- fields later) without breaking the single-Users-table design everything else FKs to (see
-- CreatedBy/UpdatedBy across this whole schema, and Bookings.CustomerId). Rows are created lazily
-- (upserted on first edit/photo upload, see sp_Profile_Set*Photo) rather than at Users-insert time,
-- so existing rows from before this feature shipped don't need a backfill.
CREATE TABLE dbo.StaffProfiles (
    UserId       INT PRIMARY KEY REFERENCES dbo.Users(Id),
    PhotoPath    NVARCHAR(500) NULL, -- web-relative path under /uploads/profile-photos, not a filesystem path
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);

-- PhotoPath moved to dbo.Users.ProfilePhoto -- a customer's photo is looked up directly off their
-- Users row now (see sp_Profile_GetCustomer/sp_Profile_SetCustomerPhoto), not through this table.
CREATE TABLE dbo.CustomerProfiles (
    UserId       INT PRIMARY KEY REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedDate  DATETIME2 NULL
);

-- Many-to-many: which locations a customer actually belongs to. Bound automatically the moment a
-- booking is confirmed there (sp_Booking_Confirm) or staff add a note/tag for them there (below) --
-- staff never bind this by hand. This is the source of truth for "is this customer mine" scoping:
-- replaces the old ad-hoc Bookings-JOIN-Locations EXISTS check in sp_Admin_SearchCustomers/
-- sp_Admin_GetCustomers's CanEmulate column and the customer list's chain/location filtering.
CREATE TABLE dbo.CustomerLocations (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId   INT NOT NULL REFERENCES dbo.Users(Id),
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    IsDelete     BIT NOT NULL DEFAULT 0,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX UX_CustomerLocations_CustomerId_LocationId ON dbo.CustomerLocations(CustomerId, LocationId) WHERE IsDelete = 0;

-- Notes and tags are scoped to exactly one of ChainId (saloon-wide, set by SuperAdmin/Admin who
-- have no single location) or LocationId (one location, set by Manager/Receptionist) -- never
-- both, never neither. A customer's record at one saloon chain shouldn't leak private staff notes
-- to an unrelated chain; a saloon-level note is visible at every location in that chain.
CREATE TABLE dbo.CustomerNotes (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId   INT NOT NULL REFERENCES dbo.Users(Id),
    ChainId      INT NULL REFERENCES dbo.SaloonChains(Id),
    LocationId   INT NULL REFERENCES dbo.Locations(Id),
    Note         NVARCHAR(MAX) NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL,
    CONSTRAINT CK_CustomerNotes_ScopeExactlyOne CHECK (
        (ChainId IS NOT NULL AND LocationId IS NULL) OR (ChainId IS NULL AND LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_CustomerNotes_CustomerId ON dbo.CustomerNotes(CustomerId) INCLUDE (ChainId, LocationId, CreatedDate) WHERE IsDelete = 0;

CREATE TABLE dbo.CustomerTags (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId   INT NOT NULL REFERENCES dbo.Users(Id),
    ChainId      INT NULL REFERENCES dbo.SaloonChains(Id),
    LocationId   INT NULL REFERENCES dbo.Locations(Id),
    Tag          NVARCHAR(100) NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL,
    CONSTRAINT CK_CustomerTags_ScopeExactlyOne CHECK (
        (ChainId IS NOT NULL AND LocationId IS NULL) OR (ChainId IS NULL AND LocationId IS NOT NULL)
    )
);
CREATE INDEX IX_CustomerTags_CustomerId ON dbo.CustomerTags(CustomerId) INCLUDE (ChainId, LocationId) WHERE IsDelete = 0;

-- One review per booking (a customer reviews the visit, not the treatment line), only ever
-- writable once the booking is Confirmed and every treatment's EndTime has passed -- see
-- sp_Review_Create for the exact eligibility check, re-derived server-side from the same
-- Confirmed+EndTime<now logic MyBookingsPage already uses client-side to show the "past" tab.
CREATE TABLE dbo.Reviews (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    BookingId    INT NOT NULL REFERENCES dbo.Bookings(Id),
    CustomerId   INT NOT NULL REFERENCES dbo.Users(Id),
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    Rating       TINYINT NOT NULL CHECK (Rating BETWEEN 1 AND 5),
    Comment      NVARCHAR(1000) NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX UX_Reviews_BookingId ON dbo.Reviews(BookingId) WHERE IsDelete = 0;
CREATE INDEX IX_Reviews_LocationId ON dbo.Reviews(LocationId) INCLUDE (Rating) WHERE IsDelete = 0;

CREATE TABLE dbo.Payments (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    BookingId      INT NOT NULL REFERENCES dbo.Bookings(Id) ON DELETE CASCADE,
    Amount         DECIMAL(10,2) NOT NULL,
    TipAmount      DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (TipAmount >= 0),
    Currency       VARCHAR(10) NOT NULL DEFAULT 'USD',
    Provider       VARCHAR(30) NOT NULL CHECK (Provider IN ('Stripe', 'Cash', 'InHouse')),
    PaymentMethod  VARCHAR(30) NOT NULL DEFAULT 'card',
    Status         VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'RequiresAction', 'Succeeded', 'Failed', 'Cancelled', 'Refunded')),
    TransactionId  NVARCHAR(200) NULL,
    ClientSecret   NVARCHAR(500) NULL,
    FailureReason  NVARCHAR(500) NULL,
    AmountTendered DECIMAL(10,2) NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedBy      INT NULL REFERENCES dbo.Users(Id),
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate    DATETIME2 NULL
);
CREATE INDEX IX_Payments_BookingId ON dbo.Payments(BookingId);

-- ===================== Phase 3: Inventory =====================

-- Chain-scoped -- a supplier relationship is a business-level thing, shared across every location
-- in the chain, unlike Products below which live at one location (same reasoning as Treatments).
CREATE TABLE dbo.Suppliers (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    ChainId      INT NOT NULL REFERENCES dbo.SaloonChains(Id),
    Name         NVARCHAR(200) NOT NULL,
    ContactEmail NVARCHAR(256) NULL,
    ContactPhone NVARCHAR(30) NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_Suppliers_ChainId ON dbo.Suppliers(ChainId) WHERE IsDelete = 0;

-- Location-scoped retail item (mirrors Treatments' one-location-owns-it model). QuantityOnHand is
-- the stock unit itself -- no separate per-location StockLevels table, since a Product already
-- belongs to exactly one location, same simplification Rooms/Treatments already make.
CREATE TABLE dbo.Products (
    Id                INT IDENTITY(1,1) PRIMARY KEY,
    LocationId        INT NOT NULL REFERENCES dbo.Locations(Id),
    SupplierId        INT NULL REFERENCES dbo.Suppliers(Id),
    Name              NVARCHAR(200) NOT NULL,
    SKU               NVARCHAR(50) NULL,
    Price             DECIMAL(10,2) NOT NULL CHECK (Price >= 0),
    QuantityOnHand    INT NOT NULL DEFAULT 0 CHECK (QuantityOnHand >= 0),
    ReorderThreshold  INT NOT NULL DEFAULT 0 CHECK (ReorderThreshold >= 0),
    IsDelete          BIT NOT NULL DEFAULT 0,
    IsActive          BIT NOT NULL DEFAULT 1,
    CreatedBy         INT NULL REFERENCES dbo.Users(Id),
    CreatedDate       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy         INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate       DATETIME2 NULL
);
CREATE INDEX IX_Products_LocationId ON dbo.Products(LocationId) WHERE IsDelete = 0;
-- Powers the low-stock view (sp_Inventory_GetLowStockProducts) without a table scan per location.
CREATE INDEX IX_Products_LowStock ON dbo.Products(LocationId, QuantityOnHand) INCLUDE (ReorderThreshold) WHERE IsDelete = 0 AND IsActive = 1;

CREATE TABLE dbo.PurchaseOrders (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    SupplierId   INT NOT NULL REFERENCES dbo.Suppliers(Id),
    Status       VARCHAR(10) NOT NULL DEFAULT 'Ordered' CHECK (Status IN ('Ordered','Received','Cancelled')),
    ReceivedDate DATETIME2 NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_PurchaseOrders_LocationId ON dbo.PurchaseOrders(LocationId) WHERE IsDelete = 0;

CREATE TABLE dbo.PurchaseOrderLines (
    Id               INT IDENTITY(1,1) PRIMARY KEY,
    PurchaseOrderId  INT NOT NULL REFERENCES dbo.PurchaseOrders(Id) ON DELETE CASCADE,
    ProductId        INT NOT NULL REFERENCES dbo.Products(Id),
    QuantityOrdered  INT NOT NULL CHECK (QuantityOrdered > 0),
    UnitCost         DECIMAL(10,2) NOT NULL CHECK (UnitCost >= 0)
);
CREATE INDEX IX_PurchaseOrderLines_PurchaseOrderId ON dbo.PurchaseOrderLines(PurchaseOrderId);

-- Retail line items on a booking, alongside its treatment lines -- Bookings is already documented
-- as "a draft/cart container for one or more treatments"; this extends the same cart to hold
-- unscheduled product lines too (no room/therapist/time needed for a retail item). UnitPrice is
-- captured from Products.Price at add time, same "lock the price into the line" pattern
-- BookingTreatments.Price already uses, so a later price change doesn't retroactively alter an
-- existing cart/receipt. Stock is deducted on sp_Booking_Confirm and restored on sp_Booking_Cancel.
CREATE TABLE dbo.BookingProducts (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    BookingId    INT NOT NULL REFERENCES dbo.Bookings(Id) ON DELETE CASCADE,
    ProductId    INT NOT NULL REFERENCES dbo.Products(Id),
    Quantity     INT NOT NULL CHECK (Quantity > 0),
    UnitPrice    DECIMAL(10,2) NOT NULL CHECK (UnitPrice >= 0),
    IsDelete     BIT NOT NULL DEFAULT 0,
    CreatedBy    INT NULL REFERENCES dbo.Users(Id),
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_BookingProducts_BookingId ON dbo.BookingProducts(BookingId) WHERE IsDelete = 0;

-- ===================== Phase 3: Team pay (commissions + pay runs) =====================

-- A rule applies to one therapist (TherapistId set) or is the location's default for every
-- therapist with no rule of their own (TherapistId NULL) -- sp_Payroll_CreatePayRun prefers the
-- therapist-specific rule when both exist. Location-scoped, not chain-wide: commission structure is
-- routinely negotiated per-location, not dictated chain-wide.
CREATE TABLE dbo.CommissionRules (
    Id                      INT IDENTITY(1,1) PRIMARY KEY,
    LocationId              INT NOT NULL REFERENCES dbo.Locations(Id),
    TherapistId             INT NULL REFERENCES dbo.TherapistProfile(Id),
    -- CREATE INDEX can't key on an expression directly -- this persisted computed column is what
    -- lets the unique index below still catch a second location-default row (TherapistId NULL),
    -- which a plain unique index on TherapistId would allow (SQL Server treats NULLs as distinct).
    TherapistKey            AS ISNULL(TherapistId, 0) PERSISTED,
    Type                    VARCHAR(10) NOT NULL CHECK (Type IN ('Percent','Flat','Hourly')),
    Rate                    DECIMAL(10,2) NOT NULL CHECK (Rate >= 0), -- Percent: 0-100; Flat: currency per booking treatment line; Hourly: currency per hour worked
    HourlyRate              DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (HourlyRate >= 0), -- Base hourly rate (if set) in addition to or as part of hourly pay
    OvertimeThresholdHours  DECIMAL(5,2) NOT NULL DEFAULT 40.0 CHECK (OvertimeThresholdHours >= 0), -- Standard period hours limit before overtime applies
    OvertimeRateMultiplier  DECIMAL(5,2) NOT NULL DEFAULT 1.5 CHECK (OvertimeRateMultiplier >= 1.0), -- Overtime pay rate multiplier (e.g. 1.5x)
    IsDelete                BIT NOT NULL DEFAULT 0,
    CreatedBy               INT NULL REFERENCES dbo.Users(Id),
    CreatedDate             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy               INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate             DATETIME2 NULL
);
CREATE UNIQUE INDEX UX_CommissionRules_Location_Therapist ON dbo.CommissionRules(LocationId, TherapistKey) WHERE IsDelete = 0;

CREATE TABLE dbo.PayRuns (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    LocationId    INT NOT NULL REFERENCES dbo.Locations(Id),
    PeriodStart   DATE NOT NULL,
    PeriodEnd     DATE NOT NULL,
    Status        VARCHAR(10) NOT NULL DEFAULT 'Draft' CHECK (Status IN ('Draft','Finalized')),
    FinalizedDate DATETIME2 NULL,
    CreatedBy     INT NULL REFERENCES dbo.Users(Id),
    CreatedDate   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy     INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate   DATETIME2 NULL,
    CONSTRAINT CK_PayRuns_Period CHECK (PeriodEnd >= PeriodStart)
);
CREATE INDEX IX_PayRuns_LocationId ON dbo.PayRuns(LocationId);

-- One row per therapist who had Confirmed revenue in the pay run's period -- a frozen snapshot
-- (GrossSales/CommissionRate/CommissionAmount all copied in at creation time, see
-- sp_Payroll_CreatePayRun) so a later commission-rule edit never rewrites an already-generated run.
CREATE TABLE dbo.PayRunLines (
    Id               INT IDENTITY(1,1) PRIMARY KEY,
    PayRunId         INT NOT NULL REFERENCES dbo.PayRuns(Id) ON DELETE CASCADE,
    TherapistId      INT NOT NULL REFERENCES dbo.TherapistProfile(Id),
    GrossSales       DECIMAL(10,2) NOT NULL,
    HoursWorked      DECIMAL(10,2) NOT NULL DEFAULT 0, -- SUM(BookingTreatments.SlotCount) * 15 min
    RegularHours     DECIMAL(10,2) NOT NULL DEFAULT 0,
    OvertimeHours    DECIMAL(10,2) NOT NULL DEFAULT 0,
    HourlyRate       DECIMAL(10,2) NOT NULL DEFAULT 0,
    CommissionRate   DECIMAL(10,2) NOT NULL,
    CommissionType   VARCHAR(10) NOT NULL CHECK (CommissionType IN ('Percent','Flat','Hourly')),
    CommissionAmount DECIMAL(10,2) NOT NULL,
    OvertimePay      DECIMAL(10,2) NOT NULL DEFAULT 0,
    TotalPay         DECIMAL(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IX_PayRunLines_PayRunId ON dbo.PayRunLines(PayRunId);

