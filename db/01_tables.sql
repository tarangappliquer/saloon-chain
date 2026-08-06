-- Run order: 01_tables -> 02_types -> 03_procs_catalog -> 04_procs_booking -> 05_procs_auth -> 06_seed -> 07_procs_admin -> 08_procs_emulation -> 09_procs_scheduling -> 10_procs_profile
-- Target: an existing SQL Server database (create one first, e.g. CREATE DATABASE SaloonChains;)

-- Every table carries the same 6 audit columns: IsDelete (soft-delete flag; nothing sets it yet --
-- no delete feature exists, but SELECT procs already filter on it), IsActive, CreatedBy/CreatedDate,
-- UpdatedBy/UpdatedDate. CreatedBy/UpdatedBy are the current logged-in user's id (ICurrentUser,
-- passed in from C# as @CreatedBy/@UpdatedBy) and FK to dbo.Users -- nullable, because system/
-- driven updates (e.g. the hold-expiry sweep) and self-registration (no user yet at the moment the
-- Users row itself is created) have no logged-in user.

CREATE TABLE dbo.SaloonChains (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
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
    OpenTime         TIME NOT NULL,
    CloseTime        TIME NOT NULL,
    WorkingDaysMask  TINYINT NOT NULL, -- bit0=Mon .. bit6=Sun
    TimeZoneId       NVARCHAR(100) NOT NULL DEFAULT 'UTC',
    IsDelete         BIT NOT NULL DEFAULT 0,
    IsActive         BIT NOT NULL DEFAULT 1,
    CreatedBy        INT NULL,
    CreatedDate      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy        INT NULL,
    UpdatedDate      DATETIME2 NULL
);

-- One-off closures (public holidays, maintenance days) on top of the weekly WorkingDaysMask.
CREATE TABLE dbo.LocationHolidays (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    HolidayDate  DATE NOT NULL,
    Reason       NVARCHAR(200) NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL,
    CONSTRAINT UQ_LocationHolidays_Location_Date UNIQUE (LocationId, HolidayDate)
);

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

CREATE TABLE dbo.Treatments (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    LocationId     INT NOT NULL REFERENCES dbo.Locations(Id),
    CategoryId     INT NOT NULL REFERENCES dbo.TreatmentCategories(Id),
    Name           NVARCHAR(200) NOT NULL,
    DurationSlots  SMALLINT NOT NULL CHECK (DurationSlots > 0), -- units of 5 minutes
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

-- Effective-dated price list: a treatment's price as of any date is the row with the latest
-- EffectiveFrom <= that date (see sp_Catalog_GetTreatments etc). A price change normally inserts a
-- new row so past bookings/history stay reconstructable -- in-place UPDATE (sp_Catalog_UpdateTreatmentPrice)
-- is only allowed while no booking has yet relied on that row (see its own comment).
CREATE TABLE dbo.TreatmentPrices (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
    Price          DECIMAL(10,2) NOT NULL,
    EffectiveFrom  DATE NOT NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL
);
CREATE INDEX IX_TreatmentPrices_TreatmentId_EffectiveFrom ON dbo.TreatmentPrices(TreatmentId, EffectiveFrom DESC);
-- One price per treatment per effective date -- filtered so a soft-deleted (corrected) entry never
-- blocks re-scheduling the same date.
CREATE UNIQUE INDEX UQ_TreatmentPrices_Treatment_EffectiveFrom ON dbo.TreatmentPrices(TreatmentId, EffectiveFrom) WHERE IsDelete = 0;

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
    IsCustomer    AS (CASE WHEN Role = 'Customer' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END),
    IsEmulator    BIT NOT NULL DEFAULT 0, -- any staff role (RootSuperAdmin/SuperAdmin/Admin/Manager/Receptionist/Therapist/Other): allowed to open a customer session on their behalf (see sp_Auth_EmulateCustomer)
    StripeCustomerId NVARCHAR(200) NULL,
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
-- Backs sp_Scheduling_AssignTherapistShift's MERGE upsert -- filtered so a soft-deleted (removed)
-- assignment doesn't block re-assigning the same therapist to the same shift/date later. RoomId is
-- NOT part of the key: a therapist works one room per shift, so re-assigning them to a different
-- room moves the existing row (updates RoomId) instead of creating a second, overlapping one.
CREATE UNIQUE INDEX UQ_ShiftAssignments_Location_Therapist_Shift_Date
    ON dbo.ShiftAssignments(LocationId, TherapistId, ShiftType, WorkDate) WHERE IsDelete = 0;
-- A room holds one therapist per shift -- sp_Scheduling_AssignTherapistShift bumps (soft-deletes)
-- whoever else is in the room before assigning the new therapist, so this is a backstop against a
-- concurrent double-assign, not the primary enforcement. RoomId IS NOT NULL excludes legacy rows.
CREATE UNIQUE INDEX UQ_ShiftAssignments_Location_Room_Shift_Date
    ON dbo.ShiftAssignments(LocationId, RoomId, ShiftType, WorkDate) WHERE IsDelete = 0 AND RoomId IS NOT NULL;

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

-- A booking is a draft/cart container for one or more treatments booked in the same checkout.
-- It carries no schedule itself -- each treatment is scheduled (room/therapist/time) independently
-- on its own BookingTreatments row, so treatments can be picked at different times. 'Draft' covers
-- the whole assembly phase (any mix of scheduled/unscheduled lines; no whole-booking expiry --
-- only individual lines expire, see BookingTreatments.ExpiresAt below).
CREATE TABLE dbo.Bookings (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    CustomerId   INT NOT NULL REFERENCES dbo.Users(Id), -- who the booking is FOR (a Users row with Role='Customer')
    Status       VARCHAR(10) NOT NULL CHECK (Status IN ('Draft','Confirmed','Cancelled')),
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

CREATE TABLE dbo.Payments (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    BookingId      INT NOT NULL REFERENCES dbo.Bookings(Id) ON DELETE CASCADE,
    Amount         DECIMAL(10,2) NOT NULL,
    Currency       VARCHAR(10) NOT NULL DEFAULT 'USD',
    Provider       VARCHAR(30) NOT NULL CHECK (Provider IN ('Stripe', 'Cash', 'InHouse')),
    PaymentMethod  VARCHAR(30) NOT NULL DEFAULT 'card',
    Status         VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'RequiresAction', 'Succeeded', 'Failed', 'Cancelled', 'Refunded')),
    TransactionId  NVARCHAR(200) NULL,
    ClientSecret   NVARCHAR(500) NULL,
    FailureReason  NVARCHAR(500) NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedBy      INT NULL REFERENCES dbo.Users(Id),
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL REFERENCES dbo.Users(Id),
    UpdatedDate    DATETIME2 NULL
);
CREATE INDEX IX_Payments_BookingId ON dbo.Payments(BookingId);

