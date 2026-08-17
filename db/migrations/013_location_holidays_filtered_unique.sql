-- UQ_LocationHolidays_Location_Date was a plain UNIQUE constraint, not filtered by IsDelete=0.
-- sp_Admin_DeleteLocationClosure soft-deletes (IsDelete=1, row stays), so re-closing a date that
-- was previously closed then reopened hit the raw constraint violation instead of a clean 409 --
-- reported live as: "Violation of UNIQUE KEY constraint 'UQ_LocationHolidays_Location_Date'".
-- Replaces it with a filtered unique index, same convention as UQ_LocationDaySchedule_* /
-- UQ_TreatmentPrices_* / UQ_TreatmentDurations_* elsewhere in this file.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = 'UQ_LocationHolidays_Location_Date' AND parent_object_id = OBJECT_ID('dbo.LocationHolidays')
)
BEGIN
    ALTER TABLE dbo.LocationHolidays DROP CONSTRAINT UQ_LocationHolidays_Location_Date;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_LocationHolidays_Location_Date' AND object_id = OBJECT_ID('dbo.LocationHolidays')
)
BEGIN
    CREATE UNIQUE INDEX UQ_LocationHolidays_Location_Date ON dbo.LocationHolidays(LocationId, HolidayDate) WHERE IsDelete = 0;
END
GO
