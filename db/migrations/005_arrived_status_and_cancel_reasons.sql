-- Migration 005: Adds the 'Arrived' fixed global appointment status (sorts first, right after
-- Confirmed -- SortOrder at the SMALLINT min pins it there the same way 'Complete' at SMALLINT max
-- pins itself last), and a CancelReasons master lookup + Bookings.CancelReasonId. Idempotent --
-- safe to re-run. After this, re-run 03_procs.sql to pick up the updated sp_Booking_CancelAsAdmin,
-- sp_Admin_GetCancelReasons, and sp_Booking_GetForLocation.

IF NOT EXISTS (SELECT 1 FROM dbo.AppointmentStatuses WHERE IsSystem = 1 AND Name = 'Arrived' AND ChainId IS NULL AND LocationId IS NULL)
BEGIN
    INSERT INTO dbo.AppointmentStatuses (Name, ChainId, LocationId, ColorHex, SortOrder, IsSystem)
    VALUES ('Arrived', NULL, NULL, '#8B5CF6', -32768, 1);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CancelReasons' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'CancelReasonId' AND object_id = OBJECT_ID('dbo.Bookings'))
BEGIN
    ALTER TABLE dbo.Bookings ADD CancelReasonId INT NULL REFERENCES dbo.CancelReasons(Id);
END
GO
