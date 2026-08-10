IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.SaloonChains') AND name = 'BreakStartTime'
)
BEGIN
    ALTER TABLE dbo.SaloonChains ADD BreakStartTime TIME NULL;
    ALTER TABLE dbo.SaloonChains ADD BreakEndTime TIME NULL;
END
GO
