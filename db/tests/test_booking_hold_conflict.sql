-- Manual check: run after 01-06 scripts. Proves sp_Booking_CreateHold rejects a second,
-- overlapping hold on the same room/time (the app-lock + overlap-check path).
-- Run: sqlcmd -S <server> -d <db> -i db/tests/test_booking_hold_conflict.sql
SET NOCOUNT ON;

BEGIN TRY
    DECLARE @LocationId INT = (SELECT TOP 1 Id FROM dbo.Locations);
    DECLARE @RoomId INT = (SELECT TOP 1 Id FROM dbo.Rooms WHERE LocationId = @LocationId);
    DECLARE @TherapistId INT = (SELECT TOP 1 TherapistId FROM dbo.ShiftAssignments WHERE LocationId = @LocationId);

    DECLARE @CustomerId INT;
    DECLARE @Email NVARCHAR(256) = CONCAT('test', CONVERT(VARCHAR(36), NEWID()), '@example.com');
    EXEC dbo.sp_Auth_CreateCustomer
        @Name = 'Test Customer', @Email = @Email,
        @PasswordHash = 0x00, @PasswordSalt = 0x00, @CustomerId = @CustomerId OUTPUT;

    DECLARE @Treatments dbo.IntIdList;
    INSERT INTO @Treatments SELECT TOP 1 Id FROM dbo.Treatments;

    DECLARE @Start DATETIME2 = DATEADD(HOUR, 10, CAST(DATEADD(DAY, 1, CAST(GETUTCDATE() AS DATE)) AS DATETIME2));
    DECLARE @End DATETIME2 = DATEADD(MINUTE, 30, @Start);

    DECLARE @BookingId1 INT, @ExpiresAt1 DATETIME2;
    EXEC dbo.sp_Booking_CreateHold
        @LocationId = @LocationId, @RoomId = @RoomId, @TherapistId = @TherapistId, @CustomerId = @CustomerId,
        @StartTime = @Start, @EndTime = @End, @Treatments = @Treatments,
        @BookingId = @BookingId1 OUTPUT, @ExpiresAt = @ExpiresAt1 OUTPUT;
    PRINT CONCAT('First hold OK, BookingId=', @BookingId1);

    DECLARE @BookingId2 INT, @ExpiresAt2 DATETIME2;
    BEGIN TRY
        EXEC dbo.sp_Booking_CreateHold
            @LocationId = @LocationId, @RoomId = @RoomId, @TherapistId = @TherapistId, @CustomerId = @CustomerId,
            @StartTime = @Start, @EndTime = @End, @Treatments = @Treatments,
            @BookingId = @BookingId2 OUTPUT, @ExpiresAt = @ExpiresAt2 OUTPUT;
        PRINT 'FAIL: second overlapping hold should have been rejected';
    END TRY
    BEGIN CATCH
        PRINT CONCAT('PASS: second hold correctly rejected -- ', ERROR_MESSAGE());
    END CATCH

    DELETE FROM dbo.BookingTreatments WHERE BookingId = @BookingId1;
    DELETE FROM dbo.Bookings WHERE Id = @BookingId1;
    DELETE FROM dbo.Customers WHERE Id = @CustomerId;
END TRY
BEGIN CATCH
    PRINT CONCAT('TEST ERROR: ', ERROR_MESSAGE());
END CATCH
