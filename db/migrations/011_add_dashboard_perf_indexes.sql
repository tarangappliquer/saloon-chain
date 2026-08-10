-- Migration 011: Indexes to make sp_Admin_GetDashboardStats's date-range reads seekable instead of
-- scanning all of Bookings/BookingTreatments (measured 6-7s dashboard load once volume built up).

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_Bookings_LocationId' AND object_id = OBJECT_ID('dbo.Bookings')
)
BEGIN
    CREATE INDEX IX_Bookings_LocationId ON dbo.Bookings(LocationId) INCLUDE (Status, CreatedDate) WHERE IsDelete = 0;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_BookingTreatments_StartTime' AND object_id = OBJECT_ID('dbo.BookingTreatments')
)
BEGIN
    CREATE INDEX IX_BookingTreatments_StartTime ON dbo.BookingTreatments(StartTime) INCLUDE (BookingId, EndTime, Price) WHERE IsDelete = 0;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_Bookings_CreatedDate' AND object_id = OBJECT_ID('dbo.Bookings')
)
BEGIN
    CREATE INDEX IX_Bookings_CreatedDate ON dbo.Bookings(CreatedDate) INCLUDE (LocationId, CustomerId, Status) WHERE IsDelete = 0;
END
GO
