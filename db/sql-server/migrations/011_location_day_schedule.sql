-- Migration 011: Effective-dated per-day-of-week hours for locations (dbo.LocationDaySchedule),
-- same pattern as dbo.TreatmentPrices/TreatmentDurations. Locations.OpenTime/CloseTime remain the
-- fallback for a day with no scheduled override -- no backfill needed, every existing location keeps
-- working exactly as before until an admin schedules a day-specific override.
-- Each guard below is independent (not nested inside the table check) so a partial prior run --
-- e.g. table created but an index creation failed due to a session QUOTED_IDENTIFIER mismatch --
-- can be re-run to completion instead of silently skipping the missing pieces.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'LocationDaySchedule' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.LocationDaySchedule (
        Id             INT IDENTITY(1,1) PRIMARY KEY,
        LocationId     INT NOT NULL REFERENCES dbo.Locations(Id),
        DayBit         TINYINT NOT NULL CHECK (DayBit IN (1, 2, 4, 8, 16, 32, 64)),
        OpenTime       TIME NOT NULL,
        CloseTime      TIME NOT NULL,
        EffectiveFrom  DATE NOT NULL,
        IsDelete       BIT NOT NULL DEFAULT 0,
        CreatedBy      INT NULL,
        CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy      INT NULL,
        UpdatedDate    DATETIME2 NULL,
        CONSTRAINT CK_LocationDaySchedule_Times CHECK (CloseTime > OpenTime)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LocationDaySchedule_Location_Day_EffectiveFrom' AND object_id = OBJECT_ID('dbo.LocationDaySchedule'))
BEGIN
    CREATE INDEX IX_LocationDaySchedule_Location_Day_EffectiveFrom ON dbo.LocationDaySchedule(LocationId, DayBit, EffectiveFrom DESC);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_LocationDaySchedule_Location_Day_EffectiveFrom' AND object_id = OBJECT_ID('dbo.LocationDaySchedule'))
BEGIN
    CREATE UNIQUE INDEX UQ_LocationDaySchedule_Location_Day_EffectiveFrom ON dbo.LocationDaySchedule(LocationId, DayBit, EffectiveFrom) WHERE IsDelete = 0;
END
GO
