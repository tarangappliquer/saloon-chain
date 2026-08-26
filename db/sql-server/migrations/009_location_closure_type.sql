-- Migration 009: Add Type (Holiday/Maintenance) to dbo.LocationHolidays for admin-managed closures.
-- Existing rows (the seed demo holiday) backfill to 'Holiday' via the column default.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.LocationHolidays') AND name = 'Type')
BEGIN
    ALTER TABLE dbo.LocationHolidays ADD Type VARCHAR(20) NOT NULL DEFAULT 'Holiday';
END
GO
