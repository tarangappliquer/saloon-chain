-- Migration 002: Add Overtime and Hourly Rate Base Pricing to Payroll

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CommissionRules') AND name = 'HourlyRate')
BEGIN
    ALTER TABLE dbo.CommissionRules ADD HourlyRate DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (HourlyRate >= 0);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CommissionRules') AND name = 'OvertimeThresholdHours')
BEGIN
    ALTER TABLE dbo.CommissionRules ADD OvertimeThresholdHours DECIMAL(5,2) NOT NULL DEFAULT 40.0 CHECK (OvertimeThresholdHours >= 0);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CommissionRules') AND name = 'OvertimeRateMultiplier')
BEGIN
    ALTER TABLE dbo.CommissionRules ADD OvertimeRateMultiplier DECIMAL(5,2) NOT NULL DEFAULT 1.5 CHECK (OvertimeRateMultiplier >= 1.0);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayRunLines') AND name = 'RegularHours')
BEGIN
    ALTER TABLE dbo.PayRunLines ADD RegularHours DECIMAL(10,2) NOT NULL DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayRunLines') AND name = 'OvertimeHours')
BEGIN
    ALTER TABLE dbo.PayRunLines ADD OvertimeHours DECIMAL(10,2) NOT NULL DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayRunLines') AND name = 'HourlyRate')
BEGIN
    ALTER TABLE dbo.PayRunLines ADD HourlyRate DECIMAL(10,2) NOT NULL DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayRunLines') AND name = 'OvertimePay')
BEGIN
    ALTER TABLE dbo.PayRunLines ADD OvertimePay DECIMAL(10,2) NOT NULL DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayRunLines') AND name = 'TotalPay')
BEGIN
    ALTER TABLE dbo.PayRunLines ADD TotalPay DECIMAL(10,2) NOT NULL DEFAULT 0;
END
GO
