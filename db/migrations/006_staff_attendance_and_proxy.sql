-- Migration 006: Add StaffEarlyArrivalMinutes, StaffAttendance table, ProxyTherapistId, and associated Stored Procedures

-- 1. Add StaffEarlyArrivalMinutes to SaloonChains & Locations
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SaloonChains') AND name = 'StaffEarlyArrivalMinutes')
BEGIN
    ALTER TABLE dbo.SaloonChains ADD StaffEarlyArrivalMinutes INT NOT NULL DEFAULT 30;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'StaffEarlyArrivalMinutes')
BEGIN
    ALTER TABLE dbo.Locations ADD StaffEarlyArrivalMinutes INT NULL;
END
GO

-- 2. Add ProxyTherapistId to BookingTreatments
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BookingTreatments') AND name = 'ProxyTherapistId')
BEGIN
    ALTER TABLE dbo.BookingTreatments ADD ProxyTherapistId INT NULL REFERENCES dbo.Users(Id);
END
GO

-- 3. Create StaffAttendance table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'StaffAttendance')
BEGIN
    CREATE TABLE dbo.StaffAttendance (
        Id           INT IDENTITY(1,1) PRIMARY KEY,
        LocationId   INT NOT NULL REFERENCES dbo.Locations(Id),
        UserId       INT NOT NULL REFERENCES dbo.Users(Id),
        WorkDate     DATE NOT NULL,
        ArrivalTime  TIME NULL,
        LeftTime     TIME NULL,
        CreatedBy    INT NOT NULL REFERENCES dbo.Users(Id),
        CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy    INT NULL REFERENCES dbo.Users(Id),
        UpdatedDate  DATETIME2 NULL
    );
    CREATE UNIQUE INDEX UX_StaffAttendance_Location_User_Date ON dbo.StaffAttendance(LocationId, UserId, WorkDate);
END
GO
