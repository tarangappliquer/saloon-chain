-- Adds date-range/single-date support (EffectiveTo) alongside the existing open-ended EffectiveFrom
-- pattern for LocationDaySchedule, TreatmentPrices, and TreatmentDurations, plus an IsClosed flag on
-- LocationDaySchedule so a day can be scheduled fully closed (not just re-timed). See db/01_tables.sql
-- for the target schema each guard below converges on.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- LocationDaySchedule ----------------------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.LocationDaySchedule') AND name = 'IsClosed')
BEGIN
    ALTER TABLE dbo.LocationDaySchedule ADD IsClosed BIT NOT NULL CONSTRAINT DF_LocationDaySchedule_IsClosed DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.LocationDaySchedule') AND name = 'EffectiveTo')
BEGIN
    ALTER TABLE dbo.LocationDaySchedule ADD EffectiveTo DATE NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_LocationDaySchedule_Times' AND parent_object_id = OBJECT_ID('dbo.LocationDaySchedule'))
BEGIN
    ALTER TABLE dbo.LocationDaySchedule DROP CONSTRAINT CK_LocationDaySchedule_Times;
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.LocationDaySchedule') AND name = 'OpenTime' AND is_nullable = 0)
BEGIN
    ALTER TABLE dbo.LocationDaySchedule ALTER COLUMN OpenTime TIME NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.LocationDaySchedule') AND name = 'CloseTime' AND is_nullable = 0)
BEGIN
    ALTER TABLE dbo.LocationDaySchedule ALTER COLUMN CloseTime TIME NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_LocationDaySchedule_Times' AND parent_object_id = OBJECT_ID('dbo.LocationDaySchedule'))
BEGIN
    ALTER TABLE dbo.LocationDaySchedule WITH CHECK
        ADD CONSTRAINT CK_LocationDaySchedule_Times CHECK (IsClosed = 1 OR (OpenTime IS NOT NULL AND CloseTime IS NOT NULL AND CloseTime > OpenTime));
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_LocationDaySchedule_DateRange' AND parent_object_id = OBJECT_ID('dbo.LocationDaySchedule'))
BEGIN
    ALTER TABLE dbo.LocationDaySchedule WITH CHECK
        ADD CONSTRAINT CK_LocationDaySchedule_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom);
END
GO

-- TreatmentPrices ---------------------------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TreatmentPrices') AND name = 'EffectiveTo')
BEGIN
    ALTER TABLE dbo.TreatmentPrices ADD EffectiveTo DATE NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_TreatmentPrices_DateRange' AND parent_object_id = OBJECT_ID('dbo.TreatmentPrices'))
BEGIN
    ALTER TABLE dbo.TreatmentPrices WITH CHECK
        ADD CONSTRAINT CK_TreatmentPrices_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom);
END
GO

-- TreatmentDurations ------------------------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TreatmentDurations') AND name = 'EffectiveTo')
BEGIN
    ALTER TABLE dbo.TreatmentDurations ADD EffectiveTo DATE NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_TreatmentDurations_DateRange' AND parent_object_id = OBJECT_ID('dbo.TreatmentDurations'))
BEGIN
    ALTER TABLE dbo.TreatmentDurations WITH CHECK
        ADD CONSTRAINT CK_TreatmentDurations_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom);
END
GO
