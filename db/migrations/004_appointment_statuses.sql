-- Migration 004: Custom per-saloon appointment progress statuses (Arrived/Started/Complete...),
-- separate from Bookings.Status' fixed lifecycle (Draft/Confirmed/Cancelled/NoShow). Includes one
-- fixed global 'Complete' status (IsSystem = 1) every saloon has, can't edit/delete, and which
-- always sorts last. Idempotent -- safe to re-run. After this, re-run 03_procs.sql to pick up
-- sp_Admin_*AppointmentStatus*, sp_Booking_SetAppointmentStatus, and the updated sp_Booking_GetForLocation.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AppointmentStatuses' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AppointmentStatuses (
        Id           INT IDENTITY(1,1) PRIMARY KEY,
        Name         NVARCHAR(50) NOT NULL,
        ChainId      INT NULL REFERENCES dbo.SaloonChains(Id),
        LocationId   INT NULL REFERENCES dbo.Locations(Id),
        ColorHex     NVARCHAR(10) NOT NULL DEFAULT '#3B82F6',
        SortOrder    SMALLINT NOT NULL DEFAULT 0,
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AppointmentStatuses_Chain' AND object_id = OBJECT_ID('dbo.AppointmentStatuses'))
    CREATE INDEX IX_AppointmentStatuses_Chain ON dbo.AppointmentStatuses(ChainId) WHERE IsDelete = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AppointmentStatuses_Location' AND object_id = OBJECT_ID('dbo.AppointmentStatuses'))
    CREATE INDEX IX_AppointmentStatuses_Location ON dbo.AppointmentStatuses(LocationId) WHERE IsDelete = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'AppointmentStatusId' AND object_id = OBJECT_ID('dbo.Bookings'))
BEGIN
    ALTER TABLE dbo.Bookings ADD AppointmentStatusId INT NULL REFERENCES dbo.AppointmentStatuses(Id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'IsSystem' AND object_id = OBJECT_ID('dbo.AppointmentStatuses'))
BEGIN
    ALTER TABLE dbo.AppointmentStatuses ADD IsSystem BIT NOT NULL DEFAULT 0;
END
GO

-- Fixed terminal status every saloon must have -- global row (ChainId/LocationId both NULL) shows
-- up for every chain/location via the same global-default clause as BlockTypes.
IF NOT EXISTS (SELECT 1 FROM dbo.AppointmentStatuses WHERE IsSystem = 1 AND Name = 'Complete' AND ChainId IS NULL AND LocationId IS NULL)
BEGIN
    INSERT INTO dbo.AppointmentStatuses (Name, ChainId, LocationId, ColorHex, SortOrder, IsSystem)
    VALUES ('Complete', NULL, NULL, '#10B981', 32767, 1);
END
GO

-- Computed flag columns mirroring Status = 'Cancelled' / 'NoShow' -- see 01_tables.sql for why
-- these are computed (always in sync with Status) rather than separately-written columns.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'IsCancelled' AND object_id = OBJECT_ID('dbo.Bookings'))
BEGIN
    ALTER TABLE dbo.Bookings ADD IsCancelled AS (CASE WHEN Status = 'Cancelled' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'IsNoShow' AND object_id = OBJECT_ID('dbo.Bookings'))
BEGIN
    ALTER TABLE dbo.Bookings ADD IsNoShow AS (CASE WHEN Status = 'NoShow' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END);
END
GO
