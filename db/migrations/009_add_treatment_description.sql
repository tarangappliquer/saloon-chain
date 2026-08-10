-- Migration 009: Treatment description.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Treatments') AND name = 'Description'
)
BEGIN
    ALTER TABLE dbo.Treatments ADD Description NVARCHAR(2000) NULL;
END
GO
