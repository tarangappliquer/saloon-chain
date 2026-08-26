-- Manual check: run after 01-06 scripts. Proves sp_Booking_ScheduleTreatment rejects a second,
-- overlapping schedule on the same room/time (the app-lock + overlap-check path), now checked at
-- the BookingTreatments line level rather than the Bookings row.
-- Run: sqlcmd -S <server> -d <db> -i db/tests/test_booking_hold_conflict.sql
SET NOCOUNT ON;

BEGIN TRY
    DECLARE @LocationId INT = (SELECT TOP 1 Id FROM dbo.Locations);
    DECLARE @RoomId INT = (SELECT TOP 1 Id FROM dbo.Rooms WHERE LocationId = @LocationId);
    DECLARE @TherapistId INT = (SELECT TOP 1 TherapistId FROM dbo.ShiftAssignments WHERE LocationId = @LocationId);

    DECLARE @CustomerId INT;
    DECLARE @Email NVARCHAR(256) = CONCAT('test', CONVERT(VARCHAR(36), NEWID()), '@example.com');
    EXEC dbo.sp_Auth_CreateUser
        @Name = 'Test Customer', @Email = @Email,
        @PasswordHash = 0x00, @PasswordSalt = 0x00, @UserId = @CustomerId OUTPUT;

    DECLARE @TreatmentId INT = (SELECT TOP 1 Id FROM dbo.Treatments);
    DECLARE @Treatments dbo.IntIdList;
    INSERT INTO @Treatments VALUES (@TreatmentId);

    DECLARE @Start DATETIME2 = DATEADD(HOUR, 10, CAST(DATEADD(DAY, 1, CAST(GETUTCDATE() AS DATE)) AS DATETIME2));
    DECLARE @End DATETIME2 = DATEADD(MINUTE, 30, @Start);

    -- Two separate draft bookings for the same customer, each with the one treatment, so each has
    -- its own BookingTreatments line contending for the same room/therapist/time.
    DECLARE @BookingId1 INT, @BookingId2 INT;
    EXEC dbo.sp_Booking_CreateDraft
        @LocationId = @LocationId, @CustomerId = @CustomerId, @Treatments = @Treatments,
        @BookingId = @BookingId1 OUTPUT;
    EXEC dbo.sp_Booking_CreateDraft
        @LocationId = @LocationId, @CustomerId = @CustomerId, @Treatments = @Treatments,
        @BookingId = @BookingId2 OUTPUT;

    DECLARE @ExpiresAt1 DATETIME2, @ScheduledLocationId1 INT;
    EXEC dbo.sp_Booking_ScheduleTreatment
        @BookingId = @BookingId1, @CustomerId = @CustomerId, @TreatmentId = @TreatmentId,
        @RoomId = @RoomId, @TherapistId = @TherapistId, @StartTime = @Start, @EndTime = @End,
        @ExpiresAt = @ExpiresAt1 OUTPUT, @LocationId = @ScheduledLocationId1 OUTPUT;
    PRINT CONCAT('First schedule OK, BookingId=', @BookingId1);

    DECLARE @ExpiresAt2 DATETIME2, @ScheduledLocationId2 INT;
    BEGIN TRY
        EXEC dbo.sp_Booking_ScheduleTreatment
            @BookingId = @BookingId2, @CustomerId = @CustomerId, @TreatmentId = @TreatmentId,
            @RoomId = @RoomId, @TherapistId = @TherapistId, @StartTime = @Start, @EndTime = @End,
            @ExpiresAt = @ExpiresAt2 OUTPUT, @LocationId = @ScheduledLocationId2 OUTPUT;
        PRINT 'FAIL: second overlapping schedule should have been rejected';
    END TRY
    BEGIN CATCH
        PRINT CONCAT('PASS: second schedule correctly rejected -- ', ERROR_MESSAGE());
    END CATCH

    DELETE FROM dbo.BookingTreatments WHERE BookingId IN (@BookingId1, @BookingId2);
    DELETE FROM dbo.Bookings WHERE Id IN (@BookingId1, @BookingId2);
    DELETE FROM dbo.Users WHERE Id = @CustomerId;
END TRY
BEGIN CATCH
    PRINT CONCAT('TEST ERROR: ', ERROR_MESSAGE());
END CATCH
