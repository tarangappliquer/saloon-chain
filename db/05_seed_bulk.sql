-- Large-scale seed data for load/perf testing: 5 chains (saloons opened 1 year apart), 3-5 locations each,
-- 3-5 rooms per location, 5 treatment categories per location, 10 treatments per category, staff users
-- (1 SuperAdmin & 1 Admin per saloon, 1 Manager per location), and 2 years of scheduling data
-- (ShiftAssignments + RoomCategoryAssignments) generating over 230K+ rows total so availability queries
-- have a realistic date range, role-based scope, and high volume to search across.
-- Additive on top of 01_tables/02_types/03_procs/04_seed -- run after those.
-- Not idempotent (re-running duplicates everything), same as 04_seed.sql.
--
-- QUOTED_IDENTIFIER/ANSI_NULLS must be ON for this session: TreatmentPrices, ShiftAssignments and
-- RoomCategoryAssignments all carry filtered unique indexes, and SQL Server rejects INSERTs against
-- a filtered index under QUOTED_IDENTIFIER OFF (error 1934) -- sqlcmd's default is OFF unless set
-- explicitly, same class of bug fixed in 03_procs.sql for stored-proc compilation.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

BEGIN TRY
BEGIN TRAN;

DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
DECLARE @DayCount INT = 731; -- 2 years + 1 day margin

-- ===== Tally 1..731, reused for every "N per X" loop below =====
;WITH T AS (
    SELECT 1 AS N
    UNION ALL
    SELECT N + 1 FROM T WHERE N < 731
)
SELECT N INTO #Tally FROM T OPTION (MAXRECURSION 731);
CREATE UNIQUE CLUSTERED INDEX IX_Tally ON #Tally (N);

-- ===== 1) Saloon Chains (5 saloons, opened 1 year apart, each with 3-5 locations) =====
CREATE TABLE #ChainSpec (Seq INT PRIMARY KEY, Name NVARCHAR(200), LocationCount INT, OpenedYearsAgo INT);
INSERT INTO #ChainSpec (Seq, Name, LocationCount, OpenedYearsAgo) VALUES
    (1, N'Radiant Beauty Saloons', 5, 4), -- Opened 4 years ago
    (2, N'Urban Edge Saloons', 4, 3),    -- Opened 3 years ago
    (3, N'Serenity Spa & Saloons', 3, 2),-- Opened 2 years ago
    (4, N'Pure Bliss Saloons', 5, 1),   -- Opened 1 year ago
    (5, N'Elite Style Saloons', 4, 0);   -- Opened today

CREATE TABLE #Chains (Seq INT PRIMARY KEY, ChainId INT NOT NULL, LocationCount INT NOT NULL, Name NVARCHAR(200) NOT NULL, OpenedYearsAgo INT NOT NULL);
MERGE dbo.SaloonChains AS tgt
USING #ChainSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (Name, CreatedDate) VALUES (src.Name, DATEADD(YEAR, -src.OpenedYearsAgo, SYSUTCDATETIME()))
OUTPUT src.Seq, inserted.Id, src.LocationCount, src.Name, src.OpenedYearsAgo INTO #Chains (Seq, ChainId, LocationCount, Name, OpenedYearsAgo);

-- ===== 2) Locations (3-5 per saloon, opening dates set to match saloon open date) =====
CREATE TABLE #CityNames (Seq INT PRIMARY KEY, City NVARCHAR(100));
INSERT INTO #CityNames (Seq, City) VALUES
    (1, N'Downtown'), (2, N'Uptown'), (3, N'Westside'), (4, N'Eastside'), (5, N'Northside');

CREATE TABLE #LocationSpec (
    Seq             INT IDENTITY(1,1) PRIMARY KEY,
    ChainId         INT NOT NULL,
    Name            NVARCHAR(200) NOT NULL,
    RoomCount       INT NOT NULL,
    OpenedYearsAgo  INT NOT NULL
);
INSERT INTO #LocationSpec (ChainId, Name, RoomCount, OpenedYearsAgo)
SELECT c.ChainId, c.Name + N' - ' + cn.City + N' Branch', 0, c.OpenedYearsAgo
FROM #Chains c
    JOIN #Tally t ON t.N <= c.LocationCount
    JOIN #CityNames cn ON cn.Seq = t.N;

-- Ensure room count cycles between 3, 4, 5 (min 3, max 5 rooms per location)
UPDATE #LocationSpec SET RoomCount = 3 + ((Seq - 1) % 3);

CREATE TABLE #Locations (Seq INT PRIMARY KEY, LocationId INT NOT NULL, RoomCount INT NOT NULL, ChainId INT NOT NULL);
MERGE dbo.Locations AS tgt
USING #LocationSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (ChainId, Name, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId, CreatedDate)
    VALUES (src.ChainId, src.Name, '09:00', '19:00', 127, 'UTC', DATEADD(YEAR, -src.OpenedYearsAgo, SYSUTCDATETIME()))
OUTPUT src.Seq, inserted.Id, src.RoomCount, src.ChainId INTO #Locations (Seq, LocationId, RoomCount, ChainId);

-- ===== 3) Rooms (3-5 per location) =====
CREATE TABLE #RoomSpec (Seq INT IDENTITY(1,1) PRIMARY KEY, LocationId INT NOT NULL, Ordinal INT NOT NULL, Name NVARCHAR(100) NOT NULL);
INSERT INTO #RoomSpec (LocationId, Ordinal, Name)
SELECT l.LocationId, t.N, N'Room ' + CAST(t.N AS NVARCHAR(10))
FROM #Locations l
    JOIN #Tally t ON t.N <= l.RoomCount;

CREATE TABLE #Rooms (Seq INT PRIMARY KEY, RoomId INT NOT NULL, LocationId INT NOT NULL, Ordinal INT NOT NULL);
MERGE dbo.Rooms AS tgt
USING #RoomSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, Name) VALUES (src.LocationId, src.Name)
OUTPUT src.Seq, inserted.Id, src.LocationId, src.Ordinal INTO #Rooms (Seq, RoomId, LocationId, Ordinal);

-- ===== 4) Treatment Categories (5 per location) =====
CREATE TABLE #CategoryNames (Ordinal INT PRIMARY KEY, Name NVARCHAR(200));
INSERT INTO #CategoryNames (Ordinal, Name) VALUES
    (1, N'Hair Care'), (2, N'Nail Care'), (3, N'Spa & Massage'), (4, N'Skin Care'), (5, N'Makeup & Beauty');

CREATE TABLE #CategorySpec (Seq INT IDENTITY(1,1) PRIMARY KEY, LocationId INT NOT NULL, Ordinal INT NOT NULL, Name NVARCHAR(200) NOT NULL);
INSERT INTO #CategorySpec (LocationId, Ordinal, Name)
SELECT l.LocationId, cn.Ordinal, cn.Name
FROM #Locations l
    CROSS JOIN #CategoryNames cn;

CREATE TABLE #Categories (Seq INT PRIMARY KEY, CategoryId INT NOT NULL, LocationId INT NOT NULL, Ordinal INT NOT NULL);
MERGE dbo.TreatmentCategories AS tgt
USING #CategorySpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, Name) VALUES (src.LocationId, src.Name)
OUTPUT src.Seq, inserted.Id, src.LocationId, src.Ordinal INTO #Categories (Seq, CategoryId, LocationId, Ordinal);

-- ===== 5) Treatments (10 per category) + Prices =====
CREATE TABLE #TreatmentNames (CategoryOrdinal INT NOT NULL, TreatmentOrdinal INT NOT NULL, Name NVARCHAR(200) NOT NULL, DurationSlots SMALLINT NOT NULL, Price DECIMAL(10,2) NOT NULL, PRIMARY KEY (CategoryOrdinal, TreatmentOrdinal));
INSERT INTO #TreatmentNames (CategoryOrdinal, TreatmentOrdinal, Name, DurationSlots, Price) VALUES
    (1, 1, N'Haircut & Style', 6, 35.00),
    (1, 2, N'Hair Wash & Blowdry', 4, 20.00),
    (1, 3, N'Hair Coloring', 12, 85.00),
    (1, 4, N'Highlights', 14, 95.00),
    (1, 5, N'Keratin Treatment', 18, 150.00),
    (1, 6, N'Hair Spa', 10, 60.00),
    (1, 7, N'Beard Trim', 3, 15.00),
    (1, 8, N'Hair Straightening', 16, 120.00),
    (1, 9, N'Scalp Treatment', 8, 45.00),
    (1, 10, N'Kids Haircut', 4, 18.00),
    (2, 1, N'Classic Manicure', 6, 25.00),
    (2, 2, N'Gel Manicure', 8, 35.00),
    (2, 3, N'Classic Pedicure', 8, 30.00),
    (2, 4, N'Gel Pedicure', 10, 40.00),
    (2, 5, N'Nail Art', 6, 20.00),
    (2, 6, N'Acrylic Extensions', 12, 55.00),
    (2, 7, N'Nail Repair', 3, 12.00),
    (2, 8, N'Paraffin Hand Treatment', 5, 18.00),
    (2, 9, N'Foot Spa', 8, 32.00),
    (2, 10, N'Polish Change', 2, 10.00),
    (3, 1, N'Swedish Massage', 12, 70.00),
    (3, 2, N'Deep Tissue Massage', 12, 80.00),
    (3, 3, N'Hot Stone Massage', 14, 90.00),
    (3, 4, N'Aromatherapy Massage', 12, 75.00),
    (3, 5, N'Reflexology', 8, 45.00),
    (3, 6, N'Couples Massage', 12, 140.00),
    (3, 7, N'Body Scrub', 10, 55.00),
    (3, 8, N'Head & Shoulder Massage', 4, 25.00),
    (3, 9, N'Full Body Wrap', 16, 100.00),
    (3, 10, N'Prenatal Massage', 12, 75.00),
    (4, 1, N'Classic Facial', 10, 50.00),
    (4, 2, N'Deep Cleansing Facial', 12, 65.00),
    (4, 3, N'Anti-Aging Facial', 14, 85.00),
    (4, 4, N'Chemical Peel', 10, 70.00),
    (4, 5, N'Microdermabrasion', 12, 80.00),
    (4, 6, N'Acne Treatment', 10, 60.00),
    (4, 7, N'Hydrafacial', 12, 90.00),
    (4, 8, N'Eye Treatment', 5, 30.00),
    (4, 9, N'Face Massage', 6, 25.00),
    (4, 10, N'Skin Consultation', 3, 15.00),
    (5, 1, N'Bridal Makeup', 20, 150.00),
    (5, 2, N'Party Makeup', 12, 80.00),
    (5, 3, N'Eyebrow Threading', 3, 12.00),
    (5, 4, N'Eyelash Extensions', 10, 60.00),
    (5, 5, N'Eyebrow Tinting', 3, 15.00),
    (5, 6, N'Makeup Trial', 15, 70.00),
    (5, 7, N'Face Contouring', 8, 40.00),
    (5, 8, N'Party Hairstyle', 10, 50.00),
    (5, 9, N'Saree Draping', 8, 30.00),
    (5, 10, N'Full Makeup & Hair', 24, 180.00);

CREATE TABLE #TreatmentSpec (Seq INT IDENTITY(1,1) PRIMARY KEY, CategoryId INT NOT NULL, LocationId INT NOT NULL, Name NVARCHAR(200) NOT NULL, DurationSlots SMALLINT NOT NULL, Price DECIMAL(10,2) NOT NULL);
INSERT INTO #TreatmentSpec (CategoryId, LocationId, Name, DurationSlots, Price)
SELECT c.CategoryId, c.LocationId, tn.Name, tn.DurationSlots, tn.Price
FROM #Categories c
    JOIN #TreatmentNames tn ON tn.CategoryOrdinal = c.Ordinal;

CREATE TABLE #Treatments (Seq INT PRIMARY KEY, TreatmentId INT NOT NULL, Price DECIMAL(10,2) NOT NULL);
MERGE dbo.Treatments AS tgt
USING #TreatmentSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, CategoryId, Name, DurationSlots) VALUES (src.LocationId, src.CategoryId, src.Name, src.DurationSlots)
OUTPUT src.Seq, inserted.Id, src.Price INTO #Treatments (Seq, TreatmentId, Price);

INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom)
SELECT TreatmentId, Price, @Today FROM #Treatments;

-- ===== 6) Staff Users (1 SuperAdmin & 1 Admin per saloon, 1 Manager per location) =====
DECLARE @DummyHash VARBINARY(256) = 0x01020304;
DECLARE @DummySalt VARBINARY(128) = 0x05060708;

-- 1 SuperAdmin per saloon chain
INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, IsEmailVerified)
SELECT 
    N'Super Admin - ' + c.Name,
    N'superadmin' + CAST(c.Seq AS NVARCHAR(10)) + N'@saloon' + CAST(c.Seq AS NVARCHAR(10)) + N'.com',
    @DummyHash, @DummySalt, 'SuperAdmin', c.ChainId, 1
FROM #Chains c;

-- 1 Admin per saloon chain
INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, IsEmailVerified)
SELECT 
    N'Admin - ' + c.Name,
    N'admin' + CAST(c.Seq AS NVARCHAR(10)) + N'@saloon' + CAST(c.Seq AS NVARCHAR(10)) + N'.com',
    @DummyHash, @DummySalt, 'Admin', c.ChainId, 1
FROM #Chains c;

-- 1 Manager per location
INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, LocationId, IsEmailVerified)
SELECT 
    N'Manager - Loc ' + CAST(l.LocationId AS NVARCHAR(10)),
    N'manager' + CAST(l.Seq AS NVARCHAR(10)) + N'@saloonlocation' + CAST(l.LocationId AS NVARCHAR(10)) + N'.com',
    @DummyHash, @DummySalt, 'Manager', l.LocationId, 1
FROM #Locations l;

-- ===== 7) Therapists (2 per room: Morning and Evening shift therapists for each room) =====
CREATE TABLE #TherapistSpec (Seq INT IDENTITY(1,1) PRIMARY KEY, LocationId INT NOT NULL, RoomId INT NOT NULL, ShiftType VARCHAR(10) NOT NULL, Name NVARCHAR(200) NOT NULL);
INSERT INTO #TherapistSpec (LocationId, RoomId, ShiftType, Name)
SELECT r.LocationId, r.RoomId, x.ShiftType, x.NamePrefix + N' (Room ' + CAST(r.Ordinal AS NVARCHAR(10)) + N', Loc ' + CAST(r.LocationId AS NVARCHAR(10)) + N')'
FROM #Rooms r
    CROSS JOIN (VALUES ('Morning', N'Morning Specialist'), ('Evening', N'Evening Specialist')) AS x(ShiftType, NamePrefix);

CREATE TABLE #Therapists (Seq INT PRIMARY KEY, TherapistId INT NOT NULL, LocationId INT NOT NULL, RoomId INT NOT NULL, ShiftType VARCHAR(10) NOT NULL);
MERGE dbo.TherapistProfile AS tgt
USING #TherapistSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (Name, LocationId) VALUES (src.Name, src.LocationId)
OUTPUT src.Seq, inserted.Id, src.LocationId, src.RoomId, src.ShiftType INTO #Therapists (Seq, TherapistId, LocationId, RoomId, ShiftType);

-- ===== 8) ShiftAssignments -- 2 years (731 days), one row per therapist/room per day =====
INSERT INTO dbo.ShiftAssignments (LocationId, TherapistId, RoomId, ShiftType, WorkDate, StartTime, EndTime)
SELECT th.LocationId, th.TherapistId, th.RoomId, th.ShiftType, DATEADD(DAY, t.N - 1, @Today),
    CASE th.ShiftType WHEN 'Morning' THEN CAST('09:00' AS TIME) ELSE CAST('14:00' AS TIME) END,
    CASE th.ShiftType WHEN 'Morning' THEN CAST('14:00' AS TIME) ELSE CAST('19:00' AS TIME) END
FROM #Therapists th
    CROSS JOIN #Tally t
WHERE t.N <= @DayCount;

-- ===== 9) RoomCategoryAssignments -- 2 years (731 days), each room open for one fixed category
-- (round-robin across the location's 5 categories), both shifts, every day =====
CREATE TABLE #RoomCategoryMap (RoomId INT NOT NULL, CategoryId INT NOT NULL);
INSERT INTO #RoomCategoryMap (RoomId, CategoryId)
SELECT r.RoomId, c.CategoryId
FROM #Rooms r
    JOIN #Categories c ON c.LocationId = r.LocationId AND c.Ordinal = ((r.Ordinal - 1) % 5) + 1;

INSERT INTO dbo.RoomCategoryAssignments (RoomId, TreatmentCategoryId, ShiftType, WorkDate)
SELECT rcm.RoomId, rcm.CategoryId, x.ShiftType, DATEADD(DAY, t.N - 1, @Today)
FROM #RoomCategoryMap rcm
    CROSS JOIN (VALUES ('Morning'), ('Evening')) AS x(ShiftType)
    CROSS JOIN #Tally t
WHERE t.N <= @DayCount;

COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    THROW;
END CATCH;

-- ===== Summary Report =====
SELECT
    (SELECT COUNT(*) FROM #Chains)                          AS SaloonsInserted,
    (SELECT COUNT(*) FROM #Locations)                       AS LocationsInserted,
    (SELECT COUNT(*) FROM #Rooms)                           AS RoomsInserted,
    (SELECT COUNT(*) FROM #Categories)                      AS CategoriesInserted,
    (SELECT COUNT(*) FROM #Treatments)                      AS TreatmentsInserted,
    (SELECT COUNT(*) FROM #Therapists)                      AS TherapistsInserted,
    (SELECT COUNT(*) FROM dbo.Users WHERE Role IN ('SuperAdmin','Admin','Manager')) AS StaffUsersInserted,
    @DayCount                                                AS DaysOfScheduling,
    (SELECT COUNT(*) FROM dbo.ShiftAssignments)             AS TotalShiftAssignments,
    (SELECT COUNT(*) FROM dbo.RoomCategoryAssignments)        AS TotalRoomCategoryAssignments,
    (SELECT COUNT(*) FROM dbo.ShiftAssignments) + (SELECT COUNT(*) FROM dbo.RoomCategoryAssignments) + (SELECT COUNT(*) FROM #Treatments) + (SELECT COUNT(*) FROM #Rooms) AS TotalDataRowsGenerated;
