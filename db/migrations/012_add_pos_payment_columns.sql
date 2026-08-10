-- Migration 012: POS/walk-in checkout support — tip capture and cash-tendered audit trail on Payments.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'TipAmount'
)
BEGIN
    ALTER TABLE dbo.Payments ADD TipAmount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (TipAmount >= 0);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'AmountTendered'
)
BEGIN
    ALTER TABLE dbo.Payments ADD AmountTendered DECIMAL(10,2) NULL;
END
GO
