-- Migration: move customer profile photo from dbo.CustomerProfiles.PhotoPath to dbo.Users.ProfilePhoto.
-- Idempotent -- safe to re-run (each step checks whether it still applies before doing anything).
-- Run this against an existing database instead of re-running 01_tables.sql (CREATE TABLE would
-- fail on tables that already exist). After this, re-run 03_procs.sql to pick up the updated
-- sp_Profile_GetCustomer/sp_Profile_SetCustomerPhoto and the new customer-CRUD procs.

-- 1. Add the new column.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'ProfilePhoto'
)
BEGIN
    ALTER TABLE dbo.Users ADD ProfilePhoto NVARCHAR(500) NULL;
END
GO

-- 2. Backfill existing customer photos before the source column is dropped.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.CustomerProfiles') AND name = 'PhotoPath'
)
BEGIN
    UPDATE u
    SET u.ProfilePhoto = cp.PhotoPath
    FROM dbo.Users u
    JOIN dbo.CustomerProfiles cp ON cp.UserId = u.Id
    WHERE cp.PhotoPath IS NOT NULL;
END
GO

-- 3. Drop the now-redundant column.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.CustomerProfiles') AND name = 'PhotoPath'
)
BEGIN
    ALTER TABLE dbo.CustomerProfiles DROP COLUMN PhotoPath;
END
GO
