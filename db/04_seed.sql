-- Dev/demo fixture data: 1 chain, 1 location, 2 rooms, 1 category, 2 treatments,
-- 2 therapists covering morning/evening shifts for the next 14 days.
SET NOCOUNT ON;

INSERT INTO dbo.SaloonChains (Name) VALUES ('Glow Salon Chain');
DECLARE @ChainId INT = SCOPE_IDENTITY();

INSERT INTO dbo.Locations (ChainId, Name, Address, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId)
VALUES (@ChainId, 'Downtown Branch', '123 Main St', '09:00', '18:00', 127, 'UTC');
DECLARE @LocationId INT = SCOPE_IDENTITY();

INSERT INTO dbo.Rooms (LocationId, Name) VALUES (@LocationId, 'Room 1'), (@LocationId, 'Room 2');
DECLARE @Room1 INT = (SELECT Id FROM dbo.Rooms WHERE LocationId = @LocationId AND Name = 'Room 1');
DECLARE @Room2 INT = (SELECT Id FROM dbo.Rooms WHERE LocationId = @LocationId AND Name = 'Room 2');

INSERT INTO dbo.TreatmentCategories (LocationId, Name) VALUES (@LocationId, 'Hair Care');
DECLARE @CategoryId INT = SCOPE_IDENTITY();

DECLARE @NewTreatments TABLE (Id INT, Name NVARCHAR(200));
INSERT INTO dbo.Treatments (LocationId, CategoryId, Name, DurationSlots)
OUTPUT inserted.Id, inserted.Name INTO @NewTreatments (Id, Name)
VALUES
    (@LocationId, @CategoryId, 'Haircut', 6),              -- 30 min
    (@LocationId, @CategoryId, 'Hair Wash & Blowdry', 4);  -- 20 min

INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom)
SELECT Id, CASE Name WHEN 'Haircut' THEN 25.00 ELSE 15.00 END, CAST(GETUTCDATE() AS DATE)
FROM @NewTreatments;

-- demo holiday: shifts/room assignments below still get generated for this date (uniform loop),
-- which is exactly what proves the explicit IsHoliday check works even if scheduling forgets it.
INSERT INTO dbo.LocationHolidays (LocationId, HolidayDate, Reason)
VALUES (@LocationId, DATEADD(DAY, 5, CAST(GETUTCDATE() AS DATE)), 'Public Holiday');

INSERT INTO dbo.TherapistProfile (Name) VALUES ('Alex Rivera'), ('Sam Chen');
DECLARE @Therapist1 INT = (SELECT Id FROM dbo.TherapistProfile WHERE Name = 'Alex Rivera');
DECLARE @Therapist2 INT = (SELECT Id FROM dbo.TherapistProfile WHERE Name = 'Sam Chen');

;WITH Dates AS (
    SELECT CAST(GETUTCDATE() AS DATE) AS WorkDate
    UNION ALL
    SELECT DATEADD(DAY, 1, WorkDate) FROM Dates WHERE WorkDate < DATEADD(DAY, 13, CAST(GETUTCDATE() AS DATE))
)
INSERT INTO dbo.ShiftAssignments (LocationId, TherapistId, ShiftType, WorkDate, StartTime, EndTime)
SELECT @LocationId, @Therapist1, 'Morning', WorkDate, '09:00', '13:30' FROM Dates
UNION ALL
SELECT @LocationId, @Therapist2, 'Evening', WorkDate, '13:30', '18:00' FROM Dates
OPTION (MAXRECURSION 20);

;WITH Dates AS (
    SELECT CAST(GETUTCDATE() AS DATE) AS WorkDate
    UNION ALL
    SELECT DATEADD(DAY, 1, WorkDate) FROM Dates WHERE WorkDate < DATEADD(DAY, 13, CAST(GETUTCDATE() AS DATE))
)
INSERT INTO dbo.RoomCategoryAssignments (RoomId, TreatmentCategoryId, ShiftType, WorkDate)
SELECT @Room1, @CategoryId, 'Morning', WorkDate FROM Dates
UNION ALL SELECT @Room1, @CategoryId, 'Evening', WorkDate FROM Dates
UNION ALL SELECT @Room2, @CategoryId, 'Morning', WorkDate FROM Dates
UNION ALL SELECT @Room2, @CategoryId, 'Evening', WorkDate FROM Dates
OPTION (MAXRECURSION 20);
