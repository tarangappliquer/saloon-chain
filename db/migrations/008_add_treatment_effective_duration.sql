-- Migration 008: Effective-dated treatment duration slots.
-- Replaces dbo.Treatments.DurationSlots with dbo.TreatmentDurations history table.

-- 1. Create TreatmentDurations table.
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'TreatmentDurations' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.TreatmentDurations (
        Id             INT IDENTITY(1,1) PRIMARY KEY,
        TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
        DurationSlots  SMALLINT NOT NULL CHECK (DurationSlots > 0),
        EffectiveFrom  DATE NOT NULL,
        IsDelete       BIT NOT NULL DEFAULT 0,
        CreatedBy      INT NULL,
        CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy      INT NULL,
        UpdatedDate    DATETIME2 NULL
    );
    CREATE INDEX IX_TreatmentDurations_TreatmentId_EffectiveFrom ON dbo.TreatmentDurations(TreatmentId, EffectiveFrom DESC);
END
GO

-- 2. One duration per treatment per effective date.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'UQ_TreatmentDurations_Treatment_EffectiveFrom' AND object_id = OBJECT_ID('dbo.TreatmentDurations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_TreatmentDurations_Treatment_EffectiveFrom ON dbo.TreatmentDurations(TreatmentId, EffectiveFrom) WHERE IsDelete = 0;
END
GO

-- 3. Backfill existing duration slots into dbo.TreatmentDurations.
IF EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Treatments') AND name = 'DurationSlots'
)
BEGIN
    EXEC('
        INSERT INTO dbo.TreatmentDurations (TreatmentId, DurationSlots, EffectiveFrom, CreatedBy)
        SELECT t.Id, t.DurationSlots, t.EffectiveFrom, t.CreatedBy
        FROM dbo.Treatments t
        WHERE NOT EXISTS (SELECT 1 FROM dbo.TreatmentDurations td WHERE td.TreatmentId = t.Id)
    ');
END
GO

-- 4. Drop DurationSlots column from dbo.Treatments (and whatever auto-named CHECK constraint SQL
-- Server generated for it -- the column can't be dropped while that constraint still references it).
IF EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Treatments') AND name = 'DurationSlots'
)
BEGIN
    DECLARE @ConstraintName SYSNAME;
    SELECT @ConstraintName = ccon.name
    FROM sys.check_constraints ccon
    WHERE ccon.parent_object_id = OBJECT_ID('dbo.Treatments')
        AND ccon.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Treatments'), 'DurationSlots', 'ColumnId');

    IF @ConstraintName IS NOT NULL
    BEGIN
        DECLARE @Sql NVARCHAR(MAX) = N'ALTER TABLE dbo.Treatments DROP CONSTRAINT ' + QUOTENAME(@ConstraintName);
        EXEC(@Sql);
    END

    ALTER TABLE dbo.Treatments DROP COLUMN DurationSlots;
END
GO

-- 5. Add TreatmentDurationId to dbo.BookingTreatments.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BookingTreatments') AND name = 'TreatmentDurationId'
)
BEGIN
    ALTER TABLE dbo.BookingTreatments ADD TreatmentDurationId INT NULL REFERENCES dbo.TreatmentDurations(Id);
END
GO
