-- Run order: 01_tables -> 02_types -> 03_procs_catalog -> 04_procs_booking -> 05_procs_auth -> 06_seed
-- Target: an existing SQL Server database (create one first, e.g. CREATE DATABASE SaloonChains;)

-- Every table carries the same 6 audit columns: IsDelete (soft-delete flag; nothing sets it yet --
-- no delete feature exists, but SELECT procs already filter on it), IsActive, CreatedBy/CreatedDate,
-- UpdatedBy/UpdatedDate. CreatedBy/UpdatedBy are the current logged-in user's id (ICurrentUser,
-- passed in from C# as @CreatedBy/@UpdatedBy) -- nullable, because system/seed-inserted rows and
-- system-driven updates (e.g. the hold-expiry sweep) have no logged-in user, and self-registration
-- has no user yet at the moment the Customers row is created. No FK on CreatedBy/UpdatedBy: once
-- RBAC lands there will be multiple kinds of "user" (staff roles, not just Customers), so a single
-- FK target doesn't exist yet.

CREATE TABLE dbo.Customers (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    Name          NVARCHAR(200)   NOT NULL,
    Email         NVARCHAR(256)   NOT NULL UNIQUE,
    PasswordHash  VARBINARY(256)  NOT NULL,
    PasswordSalt  VARBINARY(128)  NOT NULL,
    Phone         NVARCHAR(30)    NULL,
    IsDelete      BIT NOT NULL DEFAULT 0,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedBy     INT NULL,
    CreatedDate   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy     INT NULL,
    UpdatedDate   DATETIME2 NULL
);

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

CREATE TABLE dbo.TreatmentCategories (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    ChainId      INT NOT NULL REFERENCES dbo.SaloonChains(Id),
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
    ChainId        INT NOT NULL REFERENCES dbo.SaloonChains(Id),
    CategoryId     INT NOT NULL REFERENCES dbo.TreatmentCategories(Id),
    Name           NVARCHAR(200) NOT NULL,
    Price          DECIMAL(10,2) NOT NULL,
    DurationSlots  SMALLINT NOT NULL CHECK (DurationSlots > 0), -- units of 5 minutes
    IsDelete       BIT NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL
);

CREATE TABLE dbo.LocationTreatments (
    LocationId     INT NOT NULL REFERENCES dbo.Locations(Id),
    TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
    PriceOverride  DECIMAL(10,2) NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL,
    PRIMARY KEY (LocationId, TreatmentId)
);

CREATE TABLE dbo.Therapists (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);

CREATE TABLE dbo.ShiftAssignments (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    TherapistId  INT NOT NULL REFERENCES dbo.Therapists(Id),
    ShiftType    VARCHAR(10) NOT NULL CHECK (ShiftType IN ('Morning','Evening')),
    WorkDate     DATE NOT NULL,
    StartTime    TIME NOT NULL,
    EndTime      TIME NOT NULL,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL,
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_ShiftAssignments_Location_Date ON dbo.ShiftAssignments(LocationId, WorkDate);

CREATE TABLE dbo.RoomCategoryAssignments (
    Id                   INT IDENTITY(1,1) PRIMARY KEY,
    RoomId               INT NOT NULL REFERENCES dbo.Rooms(Id),
    TreatmentCategoryId  INT NOT NULL REFERENCES dbo.TreatmentCategories(Id),
    ShiftType            VARCHAR(10) NOT NULL CHECK (ShiftType IN ('Morning','Evening')),
    WorkDate             DATE NOT NULL,
    IsDelete             BIT NOT NULL DEFAULT 0,
    IsActive             BIT NOT NULL DEFAULT 1,
    CreatedBy            INT NULL,
    CreatedDate          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy            INT NULL,
    UpdatedDate          DATETIME2 NULL
);
CREATE INDEX IX_RoomCategoryAssignments_Room_Date ON dbo.RoomCategoryAssignments(RoomId, WorkDate);

CREATE TABLE dbo.Bookings (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
    RoomId       INT NOT NULL REFERENCES dbo.Rooms(Id),
    TherapistId  INT NOT NULL REFERENCES dbo.Therapists(Id),
    CustomerId   INT NOT NULL REFERENCES dbo.Customers(Id), -- who the booking is FOR
    StartTime    DATETIME2 NOT NULL,
    EndTime      DATETIME2 NOT NULL,
    Status       VARCHAR(10) NOT NULL CHECK (Status IN ('Held','Confirmed','Cancelled','Expired')),
    ExpiresAt    DATETIME2 NULL,
    RowVersion   ROWVERSION,
    IsDelete     BIT NOT NULL DEFAULT 0,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedBy    INT NULL, -- who created the row (self for customer bookings; will differ from
                            -- CustomerId once admin/receptionist can book on a customer's behalf)
    CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy    INT NULL,
    UpdatedDate  DATETIME2 NULL
);
CREATE INDEX IX_Bookings_RoomId_StartTime ON dbo.Bookings(RoomId, StartTime) INCLUDE (EndTime, Status, ExpiresAt);
CREATE INDEX IX_Bookings_TherapistId_StartTime ON dbo.Bookings(TherapistId, StartTime) INCLUDE (EndTime, Status, ExpiresAt);
CREATE INDEX IX_Bookings_CustomerId ON dbo.Bookings(CustomerId);

CREATE TABLE dbo.BookingTreatments (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    BookingId      INT NOT NULL REFERENCES dbo.Bookings(Id),
    TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
    SequenceOrder  SMALLINT NOT NULL,
    SlotCount      SMALLINT NOT NULL,
    Price          DECIMAL(10,2) NOT NULL,
    IsDelete       BIT NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedBy      INT NULL,
    CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy      INT NULL,
    UpdatedDate    DATETIME2 NULL
);
CREATE INDEX IX_BookingTreatments_BookingId ON dbo.BookingTreatments(BookingId);
