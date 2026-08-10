IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'BreakStartTime'
)
BEGIN
    ALTER TABLE dbo.Locations ADD BreakStartTime TIME NULL;
    ALTER TABLE dbo.Locations ADD BreakEndTime TIME NULL;
END
GO
