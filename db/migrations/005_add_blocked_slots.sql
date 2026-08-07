-- Migration 005: Admin-blockable schedule slots (lunch break, therapist emergency leave, etc).
-- Idempotent -- safe to re-run. Run this against an existing database instead of re-running
-- 01_tables.sql. After this, re-run 03_procs.sql to pick up sp_Scheduling_BlockSlot/UnblockSlot/
-- HasBookingOverlap/GetBlockedSlotDetails and the updated sp_Scheduling_GetRoster.

IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'BlockedSlots' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.BlockedSlots (
        Id           INT IDENTITY(1,1) PRIMARY KEY,
        RoomId       INT NOT NULL REFERENCES dbo.Rooms(Id),
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
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_BlockedSlots_Room_Date' AND object_id = OBJECT_ID('dbo.BlockedSlots')
)
BEGIN
    CREATE INDEX IX_BlockedSlots_Room_Date ON dbo.BlockedSlots(RoomId, WorkDate) WHERE IsDelete = 0;
END
GO
