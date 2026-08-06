-- Migration 003: Add ON DELETE CASCADE to BookingTreatments and Payments foreign keys referencing Bookings(Id)

-- Re-create Foreign Key on dbo.BookingTreatments with ON DELETE CASCADE
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.BookingTreatments') AND name LIKE '%Booking%')
BEGIN
    DECLARE @btFkName NVARCHAR(200);
    SELECT @btFkName = name FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.BookingTreatments') AND referenced_object_id = OBJECT_ID('dbo.Bookings');
    IF @btFkName IS NOT NULL
        EXEC('ALTER TABLE dbo.BookingTreatments DROP CONSTRAINT ' + @btFkName);
END
GO

ALTER TABLE dbo.BookingTreatments
    ADD CONSTRAINT FK_BookingTreatments_Bookings
    FOREIGN KEY (BookingId) REFERENCES dbo.Bookings(Id) ON DELETE CASCADE;
GO

-- Re-create Foreign Key on dbo.Payments with ON DELETE CASCADE
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.Payments') AND name LIKE '%Booking%')
BEGIN
    DECLARE @payFkName NVARCHAR(200);
    SELECT @payFkName = name FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.Payments') AND referenced_object_id = OBJECT_ID('dbo.Bookings');
    IF @payFkName IS NOT NULL
        EXEC('ALTER TABLE dbo.Payments DROP CONSTRAINT ' + @payFkName);
END
GO

ALTER TABLE dbo.Payments
    ADD CONSTRAINT FK_Payments_Bookings
    FOREIGN KEY (BookingId) REFERENCES dbo.Bookings(Id) ON DELETE CASCADE;
GO
