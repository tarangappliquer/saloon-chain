-- Migration 007: Add JoiningDate to Users (staff creation)

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'JoiningDate')
BEGIN
    ALTER TABLE dbo.Users ADD JoiningDate DATE NULL;
END
GO

-- Backfill existing rows (created before this column existed) with their CreatedDate -- new staff
-- creations set JoiningDate explicitly going forward (see AdminStaffEndpoints), this only covers
-- the historical gap. Guarded by JoiningDate IS NULL so it's safe to re-run and never overwrites a
-- real value.
UPDATE dbo.Users
SET JoiningDate = CAST(CreatedDate AS DATE)
WHERE JoiningDate IS NULL;
GO
