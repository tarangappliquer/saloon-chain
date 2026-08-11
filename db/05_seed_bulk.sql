-- Bulk demo/QA seed data (v2), additive on top of 01_tables/02_types/03_procs/04_seed/05_seed_bulk --
-- run after those. Not idempotent (re-running duplicates everything), same convention as
-- 05_seed_bulk.sql. Every staff user below carries a placeholder PasswordHash/Salt (0x00) --
-- can't log in as-is; reset it (or run a real password-reset flow) before using these accounts.
--
-- Scope, per the request:
--   2 RootSuperAdmin.
--   10 saloons, 5 locations each (50 total), 2 SuperAdmin + 3 Admin per saloon.
--   Per location: 5-10 therapists (cycles 5,6,7,8,9,10 across locations), 2 managers, 5 receptionists,
--   10 categories, 25 treatments/category (3 effective-dated prices each), rooms = therapist count
--   (5-10, comfortably over the "at least 3" floor) so every therapist pairs 1:1 with its own room.
--
-- ponytail: "opened room" = a (Room, ShiftType, WorkDate) that has BOTH a RoomCategoryAssignments row
-- (category assigned) and a ShiftAssignments row (therapist assigned) -- see sp_Scheduling_OpenRoom /
-- sp_Scheduling_AssignTherapistShift. Because a room holds one therapist per shift and a therapist
-- works one room per shift (both unique-indexed), the max openings/day network-wide is bounded by
-- total therapist-shifts: 371 therapists x 2 shifts. Hitting ~100,000 openings inside a 5-10
-- therapist/location cap needs 135 days (~4.5 months), not 90 (~3 months) -- 90 days only reaches
-- ~66,780. Widened the window rather than silently under-shooting the 100K figure; flagging it here
-- instead of burying it. 371 x 2 x 135 = 100,170 (both tables), reported in the summary below.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

BEGIN TRY
BEGIN TRAN;

DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
DECLARE @DayCount INT = 135;
DECLARE @SeedHash VARBINARY(256) = 0x00; -- placeholder -- not a valid login until reset
DECLARE @SeedSalt VARBINARY(128) = 0x00;
DECLARE @RootAdminId INT;

-- ===== Tally 1..135, reused for every "N per X" loop below (days, per-category treatments, etc) =====
;WITH T AS (
    SELECT 1 AS N
    UNION ALL
    SELECT N + 1 FROM T WHERE N < 135
)
SELECT N INTO #Tally FROM T OPTION (MAXRECURSION 135);
CREATE UNIQUE CLUSTERED INDEX IX_Tally ON #Tally (N);

-- ===== 0) Root Super Admins (2) =====
DECLARE @RootAdmins TABLE (Id INT);
INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified)
OUTPUT inserted.Id INTO @RootAdmins (Id)
VALUES
    (N'Root Super Admin 1', N'rootsuperadmin1@saloonchains.dev', @SeedHash, @SeedSalt, 'RootSuperAdmin', 1),
    (N'Root Super Admin 2', N'rootsuperadmin2@saloonchains.dev', @SeedHash, @SeedSalt, 'RootSuperAdmin', 1);
SET @RootAdminId = (SELECT MIN(Id) FROM @RootAdmins);

-- ===== 1) Saloon Chains (10) =====
CREATE TABLE #BrandNames (Seq INT PRIMARY KEY, Name NVARCHAR(200));
INSERT INTO #BrandNames (Seq, Name) VALUES
    (1, N'Velvet & Vine'), (2, N'Golden Hour'), (3, N'Champagne Room'), (4, N'Silver Lining'),
    (5, N'Marble & Moss'), (6, N'The Glow House'), (7, N'Ember & Oak'), (8, N'Lotus Retreat'),
    (9, N'Ivory Lane'), (10, N'Azure Studio');

CREATE TABLE #Chains (Seq INT PRIMARY KEY, ChainId INT NOT NULL, Name NVARCHAR(200) NOT NULL);
MERGE dbo.SaloonChains AS tgt
USING (SELECT Seq, Name + N' Saloons' AS Name FROM #BrandNames) AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (Name, CreatedBy) VALUES (src.Name, @RootAdminId)
OUTPUT src.Seq, inserted.Id, src.Name INTO #Chains (Seq, ChainId, Name);

-- ===== 2) Locations (5 per saloon = 50) =====
CREATE TABLE #CityNames (Seq INT PRIMARY KEY, City NVARCHAR(100));
INSERT INTO #CityNames (Seq, City) VALUES
    (1, N'Downtown'), (2, N'Uptown'), (3, N'Westside'), (4, N'Eastside'), (5, N'Northside');

CREATE TABLE #LocationSpec (Seq INT IDENTITY(1,1) PRIMARY KEY, ChainId INT NOT NULL, Name NVARCHAR(200) NOT NULL);
INSERT INTO #LocationSpec (ChainId, Name)
SELECT c.ChainId, c.Name + N' - ' + cn.City + N' Branch'
FROM #Chains c
    CROSS JOIN #CityNames cn
ORDER BY c.Seq, cn.Seq;

CREATE TABLE #Locations (Seq INT PRIMARY KEY, LocationId INT NOT NULL, ChainId INT NOT NULL, TherapistCount INT NOT NULL);
MERGE dbo.Locations AS tgt
USING (SELECT Seq, ChainId, Name, 5 + ((Seq - 1) % 6) AS TherapistCount FROM #LocationSpec) AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (ChainId, Name, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId, CreatedBy)
    VALUES (src.ChainId, src.Name, '09:00', '20:00', 127, 'UTC', @RootAdminId)
OUTPUT src.Seq, inserted.Id, src.ChainId, src.TherapistCount INTO #Locations (Seq, LocationId, ChainId, TherapistCount);

-- ===== 3) SuperAdmin (2/chain) + Admin (3/chain) staff =====
INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, IsEmailVerified)
SELECT N'Super Admin ' + CAST(t.N AS NVARCHAR(10)) + N' - ' + c.Name,
    N'superadmin' + CAST(t.N AS NVARCHAR(10)) + N'.chain' + CAST(c.ChainId AS NVARCHAR(10)) + N'@saloonchains.dev',
    @SeedHash, @SeedSalt, 'SuperAdmin', c.ChainId, 1
FROM #Chains c JOIN #Tally t ON t.N <= 2;

INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, IsEmailVerified)
SELECT N'Admin ' + CAST(t.N AS NVARCHAR(10)) + N' - ' + c.Name,
    N'admin' + CAST(t.N AS NVARCHAR(10)) + N'.chain' + CAST(c.ChainId AS NVARCHAR(10)) + N'@saloonchains.dev',
    @SeedHash, @SeedSalt, 'Admin', c.ChainId, 1
FROM #Chains c JOIN #Tally t ON t.N <= 3;

-- ===== 4) Manager (2/location) + Receptionist (5/location) staff =====
INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, LocationId, IsEmailVerified)
SELECT N'Manager ' + CAST(t.N AS NVARCHAR(10)) + N' - Loc ' + CAST(l.LocationId AS NVARCHAR(10)),
    N'manager' + CAST(t.N AS NVARCHAR(10)) + N'.loc' + CAST(l.LocationId AS NVARCHAR(10)) + N'@saloonchains.dev',
    @SeedHash, @SeedSalt, 'Manager', l.LocationId, 1
FROM #Locations l JOIN #Tally t ON t.N <= 2;

INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, LocationId, IsEmailVerified)
SELECT N'Receptionist ' + CAST(t.N AS NVARCHAR(10)) + N' - Loc ' + CAST(l.LocationId AS NVARCHAR(10)),
    N'receptionist' + CAST(t.N AS NVARCHAR(10)) + N'.loc' + CAST(l.LocationId AS NVARCHAR(10)) + N'@saloonchains.dev',
    @SeedHash, @SeedSalt, 'Receptionist', l.LocationId, 1
FROM #Locations l JOIN #Tally t ON t.N <= 5;

-- ===== 5) Rooms (= TherapistCount per location, 5-10, always >= the 3-room floor) =====
CREATE TABLE #RoomSpec (Seq INT IDENTITY(1,1) PRIMARY KEY, LocationId INT NOT NULL, Ordinal INT NOT NULL, Name NVARCHAR(100) NOT NULL);
INSERT INTO #RoomSpec (LocationId, Ordinal, Name)
SELECT l.LocationId, t.N, N'Room ' + CAST(t.N AS NVARCHAR(10))
FROM #Locations l JOIN #Tally t ON t.N <= l.TherapistCount;

CREATE TABLE #Rooms (Seq INT PRIMARY KEY, RoomId INT NOT NULL, LocationId INT NOT NULL, Ordinal INT NOT NULL);
MERGE dbo.Rooms AS tgt
USING #RoomSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, Name, CreatedBy) VALUES (src.LocationId, src.Name, @RootAdminId)
OUTPUT src.Seq, inserted.Id, src.LocationId, src.Ordinal INTO #Rooms (Seq, RoomId, LocationId, Ordinal);

-- ===== 6) Treatment Categories (10 per location) =====
CREATE TABLE #CategoryNames (Ordinal INT PRIMARY KEY, Name NVARCHAR(200));
INSERT INTO #CategoryNames (Ordinal, Name) VALUES
    (1, N'Hair Care'), (2, N'Nail Care'), (3, N'Spa & Massage'), (4, N'Skin Care'), (5, N'Makeup & Beauty'),
    (6, N'Barbering'), (7, N'Wellness & Fitness'), (8, N'Bridal Services'), (9, N'Kids Care'), (10, N'Waxing & Threading');

CREATE TABLE #CategorySpec (Seq INT IDENTITY(1,1) PRIMARY KEY, LocationId INT NOT NULL, Ordinal INT NOT NULL, Name NVARCHAR(200) NOT NULL);
INSERT INTO #CategorySpec (LocationId, Ordinal, Name)
SELECT l.LocationId, cn.Ordinal, cn.Name
FROM #Locations l CROSS JOIN #CategoryNames cn;

CREATE TABLE #Categories (Seq INT PRIMARY KEY, CategoryId INT NOT NULL, LocationId INT NOT NULL, Ordinal INT NOT NULL);
MERGE dbo.TreatmentCategories AS tgt
USING #CategorySpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, Name, CreatedBy) VALUES (src.LocationId, src.Name, @RootAdminId)
OUTPUT src.Seq, inserted.Id, src.LocationId, src.Ordinal INTO #Categories (Seq, CategoryId, LocationId, Ordinal);

-- ===== 7) Treatments (25 per category = 12,500) + 3 effective-dated prices/durations each =====
CREATE TABLE #TreatmentSpec (
    Seq INT IDENTITY(1,1) PRIMARY KEY, CategoryId INT NOT NULL, LocationId INT NOT NULL, Ordinal INT NOT NULL,
    Name NVARCHAR(200) NOT NULL, BasePrice DECIMAL(10,2) NOT NULL, DurationSlots SMALLINT NOT NULL
);
INSERT INTO #TreatmentSpec (CategoryId, LocationId, Ordinal, Name, BasePrice, DurationSlots)
SELECT c.CategoryId, c.LocationId, t.N,
    cn.Name + N' Treatment ' + RIGHT('0' + CAST(t.N AS NVARCHAR(2)), 2),
    10 + (t.N * 4) + (c.Ordinal * 2),
    2 + ((t.N * 3) % 18)
FROM #Categories c
    JOIN #CategoryNames cn ON cn.Ordinal = c.Ordinal
    JOIN #Tally t ON t.N <= 25;

CREATE TABLE #Treatments (Seq INT PRIMARY KEY, TreatmentId INT NOT NULL, BasePrice DECIMAL(10,2) NOT NULL, DurationSlots SMALLINT NOT NULL);
MERGE dbo.Treatments AS tgt
USING #TreatmentSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, CategoryId, Name, CreatedBy) VALUES (src.LocationId, src.CategoryId, src.Name, @RootAdminId)
OUTPUT src.Seq, inserted.Id, src.BasePrice, src.DurationSlots INTO #Treatments (Seq, TreatmentId, BasePrice, DurationSlots);

-- 3 effective-dated prices per treatment: older = cheaper (price rose over time), matching 05_seed_bulk's convention.
INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy)
SELECT tr.TreatmentId, ROUND(tr.BasePrice * o.Factor, 2), DATEADD(DAY, -o.DaysAgo, @Today), @RootAdminId
FROM #Treatments tr
    CROSS JOIN (VALUES (90, 0.80), (45, 0.90), (0, 1.00)) AS o(DaysAgo, Factor);

INSERT INTO dbo.TreatmentDurations (TreatmentId, DurationSlots, EffectiveFrom, CreatedBy)
SELECT TreatmentId, DurationSlots, @Today, @RootAdminId
FROM #Treatments;

-- ===== 8) Therapists (5-10/location) -- TherapistProfile + a Therapist-role login each, linked both ways =====
CREATE TABLE #TherapistSpec (Seq INT IDENTITY(1,1) PRIMARY KEY, LocationId INT NOT NULL, ChainId INT NOT NULL, Ordinal INT NOT NULL, Name NVARCHAR(200) NOT NULL);
INSERT INTO #TherapistSpec (LocationId, ChainId, Ordinal, Name)
SELECT l.LocationId, l.ChainId, t.N, N'Therapist ' + CAST(t.N AS NVARCHAR(10)) + N' - Loc ' + CAST(l.LocationId AS NVARCHAR(10))
FROM #Locations l JOIN #Tally t ON t.N <= l.TherapistCount;

CREATE TABLE #Therapists (Seq INT PRIMARY KEY, TherapistId INT NOT NULL, LocationId INT NOT NULL, Ordinal INT NOT NULL, Name NVARCHAR(200) NOT NULL);
MERGE dbo.TherapistProfile AS tgt
USING #TherapistSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (Name, ChainId, LocationId, CreatedBy) VALUES (src.Name, src.ChainId, src.LocationId, @RootAdminId)
OUTPUT src.Seq, inserted.Id, src.LocationId, src.Ordinal, src.Name INTO #Therapists (Seq, TherapistId, LocationId, Ordinal, Name);

DECLARE @TherapistUsers TABLE (TherapistId INT NOT NULL, UserId INT NOT NULL);
INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Role, LocationId, TherapistId, IsEmailVerified)
OUTPUT inserted.TherapistId, inserted.Id INTO @TherapistUsers (TherapistId, UserId)
SELECT th.Name, N'therapist' + CAST(th.Ordinal AS NVARCHAR(10)) + N'.loc' + CAST(th.LocationId AS NVARCHAR(10)) + N'@saloonchains.dev',
    @SeedHash, @SeedSalt, 'Therapist', th.LocationId, th.TherapistId, 1
FROM #Therapists th;

UPDATE tp SET UserId = tu.UserId
FROM dbo.TherapistProfile tp
    JOIN @TherapistUsers tu ON tu.TherapistId = tp.Id;

-- ===== 9) "Opened room" data: ShiftAssignments + RoomCategoryAssignments, paired 1:1 on
-- (Room, ShiftType, WorkDate) -- room<->therapist bijection by Ordinal within each location
-- (RoomCount == TherapistCount there), x 2 shifts x 135 days = 100,170 rows in each table. =====
CREATE TABLE #RoomTherapistPairs (LocationId INT NOT NULL, RoomId INT NOT NULL, TherapistId INT NOT NULL, RoomOrdinal INT NOT NULL);
INSERT INTO #RoomTherapistPairs (LocationId, RoomId, TherapistId, RoomOrdinal)
SELECT r.LocationId, r.RoomId, th.TherapistId, r.Ordinal
FROM #Rooms r
    JOIN #Therapists th ON th.LocationId = r.LocationId AND th.Ordinal = r.Ordinal;

INSERT INTO dbo.ShiftAssignments (LocationId, TherapistId, RoomId, ShiftType, WorkDate, StartTime, EndTime, CreatedBy)
SELECT p.LocationId, p.TherapistId, p.RoomId, x.ShiftType, DATEADD(DAY, t.N - 1, @Today),
    CASE x.ShiftType WHEN 'Morning' THEN CAST('09:00' AS TIME) ELSE CAST('14:00' AS TIME) END,
    CASE x.ShiftType WHEN 'Morning' THEN CAST('13:00' AS TIME) ELSE CAST('20:00' AS TIME) END,
    @RootAdminId
FROM #RoomTherapistPairs p
    CROSS JOIN (VALUES ('Morning'), ('Evening')) AS x(ShiftType)
    CROSS JOIN #Tally t
WHERE t.N <= @DayCount;

INSERT INTO dbo.RoomCategoryAssignments (RoomId, TreatmentCategoryId, ShiftType, WorkDate, CreatedBy)
SELECT p.RoomId, c.CategoryId, x.ShiftType, DATEADD(DAY, t.N - 1, @Today), @RootAdminId
FROM #RoomTherapistPairs p
    CROSS JOIN (VALUES ('Morning'), ('Evening')) AS x(ShiftType)
    CROSS JOIN #Tally t
    JOIN #Categories c ON c.LocationId = p.LocationId AND c.Ordinal = ((p.RoomOrdinal + t.N) % 10) + 1
WHERE t.N <= @DayCount;

COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    THROW;
END CATCH;

-- ===== Summary Report =====
SELECT
    (SELECT COUNT(*) FROM @RootAdmins)                       AS RootSuperAdminsInserted,
    (SELECT COUNT(*) FROM #Chains)                           AS SaloonsInserted,
    (SELECT COUNT(*) FROM #Locations)                        AS LocationsInserted,
    (SELECT COUNT(*) FROM dbo.Users WHERE Role = 'SuperAdmin' AND ChainId IN (SELECT ChainId FROM #Chains)) AS SuperAdminsInserted,
    (SELECT COUNT(*) FROM dbo.Users WHERE Role = 'Admin' AND ChainId IN (SELECT ChainId FROM #Chains))      AS AdminsInserted,
    (SELECT COUNT(*) FROM dbo.Users WHERE Role = 'Manager' AND LocationId IN (SELECT LocationId FROM #Locations))      AS ManagersInserted,
    (SELECT COUNT(*) FROM dbo.Users WHERE Role = 'Receptionist' AND LocationId IN (SELECT LocationId FROM #Locations)) AS ReceptionistsInserted,
    (SELECT COUNT(*) FROM #Rooms)                             AS RoomsInserted,
    (SELECT COUNT(*) FROM #Categories)                        AS CategoriesInserted,
    (SELECT COUNT(*) FROM #Treatments)                        AS TreatmentsInserted,
    (SELECT COUNT(*) FROM dbo.TreatmentPrices WHERE TreatmentId IN (SELECT TreatmentId FROM #Treatments))    AS TreatmentPricesInserted,
    (SELECT COUNT(*) FROM #Therapists)                        AS TherapistsInserted,
    (SELECT COUNT(*) FROM @TherapistUsers)                    AS TherapistUsersInserted,
    @DayCount                                                 AS DaysOfScheduling,
    (SELECT COUNT(*) FROM #RoomTherapistPairs)                AS RoomTherapistPairsPerDayShift,
    (SELECT COUNT(*) FROM dbo.ShiftAssignments WHERE LocationId IN (SELECT LocationId FROM #Locations))           AS TotalShiftAssignments,
    (SELECT COUNT(*) FROM dbo.RoomCategoryAssignments WHERE RoomId IN (SELECT RoomId FROM #Rooms))                AS TotalOpenedRoomRecords;
