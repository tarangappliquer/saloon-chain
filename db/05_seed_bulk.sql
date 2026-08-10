-- Large-scale seed data for load/perf testing: 5 chains (saloons opened 1 year apart), 3-5 locations each,
-- 3-5 rooms per location, 5 treatment categories per location, 10 treatments per category, staff users
-- (1 SuperAdmin & 1 Admin per saloon, 1 Manager per location), 2 years of scheduling data
-- (ShiftAssignments + RoomCategoryAssignments), a 50,000-row customer pool, and ~1,000,000
-- BookingTreatments rows (occupied/"opened" slots) covering every booking condition: all three
-- Bookings.Status values (including both an active and an already-expired Draft hold), single- and
-- multi-treatment bookings scheduled back-to-back in the same room, appointments anchored at the
-- exact start of a shift and others whose cumulative duration deliberately runs past shift close,
-- the first and last day of the 2-year window, and treatments captured against a real mix of
-- historical TreatmentPrices/TreatmentDurations rows (not just the single row effective today).
-- Additive on top of 01_tables/02_types/03_procs/04_seed -- run after those.
-- Not idempotent (re-running duplicates everything), same as 04_seed.sql.
--
-- QUOTED_IDENTIFIER/ANSI_NULLS must be ON for this session: TreatmentPrices, TreatmentDurations,
-- ShiftAssignments and RoomCategoryAssignments all carry filtered unique indexes, and SQL Server
-- rejects INSERTs against a filtered index under QUOTED_IDENTIFIER OFF (error 1934) -- sqlcmd's
-- default is OFF unless set explicitly (or invoked with -I), same class of bug fixed in 03_procs.sql
-- for stored-proc compilation.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

BEGIN TRY
BEGIN TRAN;

DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
DECLARE @DayCount INT = 731; -- 2 years + 1 day margin
DECLARE @DummyHash VARBINARY(256) = 0x01020304;
DECLARE @DummySalt VARBINARY(128) = 0x05060708;

-- ===== Tally 1..731, reused for every "N per X" loop below =====
;WITH T AS (
    SELECT 1 AS N
    UNION ALL
    SELECT N + 1 FROM T WHERE N < 731
)
SELECT N INTO #Tally FROM T OPTION (MAXRECURSION 731);
CREATE UNIQUE CLUSTERED INDEX IX_Tally ON #Tally (N);

-- ===== BigTally 1..2,000,000: cheap set-based number generator (cross-joined power-of-2 blocks,
-- capped with TOP so the optimizer never has to materialize the full cross product) -- reused below
-- for the customer pool and for CROSS APPLY TOP(N) expansions instead of a recursive CTE, which
-- SQL Server executes row-by-row and would be far too slow at this scale. =====
;WITH L0 AS (SELECT n FROM (VALUES (1),(1)) AS x(n)),                 -- 2
L1 AS (SELECT 1 AS n FROM L0 a CROSS JOIN L0 b),                       -- 4
L2 AS (SELECT 1 AS n FROM L1 a CROSS JOIN L1 b),                       -- 16
L3 AS (SELECT 1 AS n FROM L2 a CROSS JOIN L2 b),                       -- 256
L4 AS (SELECT 1 AS n FROM L3 a CROSS JOIN L3 b),                       -- 65,536
L5 AS (SELECT 1 AS n FROM L4 a CROSS JOIN L4 b)                        -- 4,294,967,296 (never materialized -- TOP below short-circuits it)
SELECT TOP (2000000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS N
INTO #BigTally
FROM L5;
CREATE UNIQUE CLUSTERED INDEX IX_BigTally ON #BigTally (N);

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

-- ===== 5) Treatments (10 per category) + effective-dated Price/Duration history =====
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

CREATE TABLE #TreatmentSpec (Seq INT IDENTITY(1,1) PRIMARY KEY, CategoryId INT NOT NULL, LocationId INT NOT NULL, CategoryOrdinal INT NOT NULL, TreatmentOrdinal INT NOT NULL, Name NVARCHAR(200) NOT NULL, DurationSlots SMALLINT NOT NULL, Price DECIMAL(10,2) NOT NULL);
INSERT INTO #TreatmentSpec (CategoryId, LocationId, CategoryOrdinal, TreatmentOrdinal, Name, DurationSlots, Price)
SELECT c.CategoryId, c.LocationId, c.Ordinal, tn.TreatmentOrdinal, tn.Name, tn.DurationSlots, tn.Price
FROM #Categories c
    JOIN #TreatmentNames tn ON tn.CategoryOrdinal = c.Ordinal;

-- Treatments.DurationSlots was moved out to dbo.TreatmentDurations (effective-dated, see
-- migration 008) -- seed the treatment row itself here, then its duration/price rows below.
CREATE TABLE #Treatments (Seq INT PRIMARY KEY, TreatmentId INT NOT NULL, CategoryId INT NOT NULL, CategoryOrdinal INT NOT NULL, TreatmentOrdinal INT NOT NULL, DurationSlots SMALLINT NOT NULL, Price DECIMAL(10,2) NOT NULL);
MERGE dbo.Treatments AS tgt
USING #TreatmentSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, CategoryId, Name) VALUES (src.LocationId, src.CategoryId, src.Name)
OUTPUT src.Seq, inserted.Id, src.CategoryId, src.CategoryOrdinal, src.TreatmentOrdinal, src.DurationSlots, src.Price
    INTO #Treatments (Seq, TreatmentId, CategoryId, CategoryOrdinal, TreatmentOrdinal, DurationSlots, Price);
CREATE INDEX IX_Treatments_Category_Ordinal ON #Treatments (CategoryId, TreatmentOrdinal);

INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom)
SELECT TreatmentId, Price, @Today FROM #Treatments;

INSERT INTO dbo.TreatmentDurations (TreatmentId, DurationSlots, PreTimeMinutes, EffectiveFrom)
SELECT TreatmentId, DurationSlots, 0, @Today FROM #Treatments;

-- 5b) Historical price/duration variety: 3 more effective-dated rows per treatment, spread across
-- the past 2 years, so BookingTreatments below capture a real mix of TreatmentPriceId/
-- TreatmentDurationId FKs instead of every booking pointing at the single "today" row. The most
-- recent historical duration row also carries a non-zero PreTimeMinutes, so some captured bookings
-- exercise the arrival-buffer field too.
INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom)
SELECT t.TreatmentId, ROUND(t.Price * o.Factor, 2), DATEADD(DAY, -o.DaysAgo, @Today)
FROM #Treatments t
    CROSS JOIN (VALUES (700, 0.80), (400, 0.88), (100, 0.94)) AS o(DaysAgo, Factor);

INSERT INTO dbo.TreatmentDurations (TreatmentId, DurationSlots, PreTimeMinutes, EffectiveFrom)
SELECT t.TreatmentId,
    CASE WHEN t.DurationSlots + o.SlotDelta < 1 THEN 1 ELSE t.DurationSlots + o.SlotDelta END,
    o.PreTime,
    DATEADD(DAY, -o.DaysAgo, @Today)
FROM #Treatments t
    CROSS JOIN (VALUES (650, -1, 0), (350, 1, 0), (50, 0, 10)) AS o(DaysAgo, SlotDelta, PreTime);

-- ===== 6) Staff Users (1 SuperAdmin & 1 Admin per saloon, 1 Manager per location) =====
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

-- ===== 6b) Customer pool (50,000) for the bulk bookings below -- @test.test per bulk-seed convention =====
CREATE TABLE #Customers (Seq INT PRIMARY KEY, CustomerId INT NOT NULL);
CREATE TABLE #CustomerSpec (Seq INT NOT NULL PRIMARY KEY, Name NVARCHAR(200) NOT NULL, Email NVARCHAR(256) NOT NULL);
INSERT INTO #CustomerSpec (Seq, Name, Email)
SELECT N, N'Test Customer ' + CAST(N AS NVARCHAR(10)), N'customer' + CAST(N AS NVARCHAR(10)) + N'@test.test'
FROM #BigTally WHERE N <= 50000;

MERGE dbo.Users AS tgt
USING #CustomerSpec AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified)
    VALUES (src.Name, src.Email, @DummyHash, @DummySalt, 'Customer', 1)
OUTPUT src.Seq, inserted.Id INTO #Customers (Seq, CustomerId);

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
CREATE INDEX IX_Therapists_Room_Shift ON #Therapists (RoomId, ShiftType);

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
CREATE TABLE #RoomCategoryMap (RoomId INT NOT NULL PRIMARY KEY, CategoryId INT NOT NULL);
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

-- ===== 10) Bookings + BookingTreatments (~1,000,000 occupied "opened" slots) =====
--
-- Model: every (Room, ShiftType) is an "anchor" (who/what never rotates by day in this seed --
-- one fixed category per room, one fixed therapist per room+shift, matching #RoomCategoryMap/
-- #Therapists above). Each anchor's 731 days x 5 hours is packed with up to 4 back-to-back
-- customer "groups" (bookings) per shift, each holding 1-3 sequential treatments (multi-treatment
-- bookings scheduled one after another in the same room -- the "back-to-back" edge case). Later
-- groups in a busy shift routinely push a booking's cumulative duration past the shift's own close
-- time, which is deliberate: it exercises the "appointment runs past shift end" boundary condition
-- without any special-casing. Group 1's first line always starts at exactly the shift's open time,
-- covering the opposite boundary. Every price/duration is resolved against whichever
-- TreatmentPrices/TreatmentDurations row was effective as of that appointment's date (the same
-- resolution sp_Catalog_GetTreatments itself uses), so the FK mix spans the full price/duration
-- history seeded above, not just today's row.
CREATE TABLE #Anchors (AnchorSeq INT IDENTITY(1,1) PRIMARY KEY, RoomId INT NOT NULL, LocationId INT NOT NULL, CategoryId INT NOT NULL, TherapistId INT NOT NULL, ShiftType VARCHAR(10) NOT NULL, ShiftStart TIME NOT NULL);
INSERT INTO #Anchors (RoomId, LocationId, CategoryId, TherapistId, ShiftType, ShiftStart)
SELECT r.RoomId, r.LocationId, rcm.CategoryId, th.TherapistId, th.ShiftType,
    CASE th.ShiftType WHEN 'Morning' THEN CAST('09:00' AS TIME) ELSE CAST('14:00' AS TIME) END
FROM #Rooms r
    JOIN #RoomCategoryMap rcm ON rcm.RoomId = r.RoomId
    JOIN #Therapists th ON th.RoomId = r.RoomId;

-- Each anchor x each of the 731 days x up to 4 customer groups per shift. GroupSize (mostly 1
-- treatment, sometimes 2-3) cycles deterministically off Anchor/day/group so the mix is even
-- without NEWID() -- kept mostly-1 because this catalog's treatments already run 15-360 minutes
-- each, so even single-treatment groups routinely fill a big chunk of a 5-hour shift on their own.
CREATE TABLE #GroupSpec (GroupSeq INT IDENTITY(1,1) PRIMARY KEY, AnchorSeq INT NOT NULL, WorkDate DATE NOT NULL, GroupIndexInShift INT NOT NULL, GroupSize TINYINT NOT NULL);
INSERT INTO #GroupSpec (AnchorSeq, WorkDate, GroupIndexInShift, GroupSize)
SELECT a.AnchorSeq, DATEADD(DAY, d.N - 1, @Today), g.N,
    CASE ((a.AnchorSeq + d.N + g.N) % 8)
        WHEN 0 THEN 1 WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 1
        WHEN 4 THEN 1 WHEN 5 THEN 2 WHEN 6 THEN 1 ELSE 3
    END
FROM #Anchors a
    CROSS JOIN #Tally d
    CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS g(N)
WHERE d.N <= @DayCount;
CREATE INDEX IX_GroupSpec_Anchor_Date ON #GroupSpec (AnchorSeq, WorkDate, GroupIndexInShift);

-- Expand each group into its 1-3 treatment lines.
CREATE TABLE #LineSpec (LineSeq INT IDENTITY(1,1) PRIMARY KEY, GroupSeq INT NOT NULL, AnchorSeq INT NOT NULL, WorkDate DATE NOT NULL, LineSeqInGroup INT NOT NULL);
INSERT INTO #LineSpec (GroupSeq, AnchorSeq, WorkDate, LineSeqInGroup)
SELECT gs.GroupSeq, gs.AnchorSeq, gs.WorkDate, ln.N
FROM #GroupSpec gs
    CROSS APPLY (SELECT TOP (gs.GroupSize) N FROM #BigTally ORDER BY N) ln;
CREATE INDEX IX_LineSpec_GroupSeq ON #LineSpec (GroupSeq, LineSeqInGroup);

-- Pick a treatment for each line (cycling through the anchor's category's 10 treatments), then
-- resolve the price/duration that was actually effective as of the line's WorkDate.
CREATE TABLE #LineDetail (
    LineSeq INT PRIMARY KEY, GroupSeq INT NOT NULL, AnchorSeq INT NOT NULL, WorkDate DATE NOT NULL, LineSeqInGroup INT NOT NULL,
    TreatmentId INT NOT NULL, DurationMinutes INT NOT NULL, SlotCount SMALLINT NOT NULL,
    Price DECIMAL(10,2) NOT NULL, TreatmentPriceId INT NOT NULL, TreatmentDurationId INT NOT NULL
);
INSERT INTO #LineDetail (LineSeq, GroupSeq, AnchorSeq, WorkDate, LineSeqInGroup, TreatmentId, DurationMinutes, SlotCount, Price, TreatmentPriceId, TreatmentDurationId)
SELECT ls.LineSeq, ls.GroupSeq, ls.AnchorSeq, ls.WorkDate, ls.LineSeqInGroup,
    tr.TreatmentId, cd.DurationSlots * 15, cd.DurationSlots, cp.Price, cp.TreatmentPriceId, cd.TreatmentDurationId
FROM #LineSpec ls
    JOIN #Anchors a ON a.AnchorSeq = ls.AnchorSeq
    JOIN #Treatments tr ON tr.CategoryId = a.CategoryId
        AND tr.TreatmentOrdinal = ((ls.LineSeq + ls.AnchorSeq) % 10) + 1
    CROSS APPLY (
        SELECT TOP 1 tp.Id AS TreatmentPriceId, tp.Price
        FROM dbo.TreatmentPrices tp
        WHERE tp.TreatmentId = tr.TreatmentId AND tp.EffectiveFrom <= ls.WorkDate AND tp.IsDelete = 0
        ORDER BY tp.EffectiveFrom DESC
    ) cp
    CROSS APPLY (
        SELECT TOP 1 td.Id AS TreatmentDurationId, td.DurationSlots
        FROM dbo.TreatmentDurations td
        WHERE td.TreatmentId = tr.TreatmentId AND td.EffectiveFrom <= ls.WorkDate AND td.IsDelete = 0
        ORDER BY td.EffectiveFrom DESC
    ) cd;

-- Group-level totals (one row per booking) and each group's start offset within its shift, packed
-- back-to-back in GroupIndexInShift order -- this is what lets group 4/5 legitimately run past the
-- shift's own close time on a busy anchor/day.
CREATE TABLE #GroupTotals (GroupSeq INT PRIMARY KEY, AnchorSeq INT NOT NULL, WorkDate DATE NOT NULL, GroupIndexInShift INT NOT NULL, GroupTotalMinutes INT NOT NULL, GroupStartOffsetMinutes INT NOT NULL);
;WITH Agg AS (
    SELECT GroupSeq, AnchorSeq, WorkDate, MIN(LineSeqInGroup) AS DummyOrder, SUM(DurationMinutes) AS GroupTotalMinutes
    FROM #LineDetail
    GROUP BY GroupSeq, AnchorSeq, WorkDate
),
WithIndex AS (
    SELECT a.GroupSeq, a.AnchorSeq, a.WorkDate, gs.GroupIndexInShift, a.GroupTotalMinutes
    FROM Agg a
        JOIN #GroupSpec gs ON gs.GroupSeq = a.GroupSeq
)
INSERT INTO #GroupTotals (GroupSeq, AnchorSeq, WorkDate, GroupIndexInShift, GroupTotalMinutes, GroupStartOffsetMinutes)
SELECT GroupSeq, AnchorSeq, WorkDate, GroupIndexInShift, GroupTotalMinutes,
    SUM(GroupTotalMinutes) OVER (PARTITION BY AnchorSeq, WorkDate ORDER BY GroupIndexInShift ROWS UNBOUNDED PRECEDING) - GroupTotalMinutes
FROM WithIndex;

-- Booking-level status mix, deterministic off the group's own identity: 40% Confirmed, 20%
-- Cancelled, 20% Draft with an active hold, 20% Draft with an already-expired hold (the last one
-- is the "held but never swept" edge case HoldExpirySweepService exists to clean up).
CREATE TABLE #Groups (GroupSeq INT PRIMARY KEY, AnchorSeq INT NOT NULL, WorkDate DATE NOT NULL, GroupStartOffsetMinutes INT NOT NULL, Status VARCHAR(10) NOT NULL, ExpiresAt DATETIME2 NULL, CustomerId INT NOT NULL, BookingId INT NULL);
INSERT INTO #Groups (GroupSeq, AnchorSeq, WorkDate, GroupStartOffsetMinutes, Status, ExpiresAt, CustomerId)
SELECT gt.GroupSeq, gt.AnchorSeq, gt.WorkDate, gt.GroupStartOffsetMinutes,
    CASE (gt.GroupSeq % 5) WHEN 0 THEN 'Confirmed' WHEN 1 THEN 'Confirmed' WHEN 2 THEN 'Cancelled' ELSE 'Draft' END,
    CASE (gt.GroupSeq % 5)
        WHEN 3 THEN DATEADD(MINUTE, 1 + (gt.GroupSeq % 5), SYSUTCDATETIME())        -- Draft, active hold
        WHEN 4 THEN DATEADD(MINUTE, -(1 + (gt.GroupSeq % 120)), SYSUTCDATETIME())   -- Draft, expired hold
        ELSE NULL
    END,
    c.CustomerId
FROM #GroupTotals gt
    JOIN #Customers c ON c.Seq = (gt.GroupSeq % 50000) + 1;

-- ===== Bookings (one per group) =====
CREATE TABLE #BookingIds (GroupSeq INT PRIMARY KEY, BookingId INT NOT NULL);
MERGE dbo.Bookings AS tgt
USING (
    SELECT g.GroupSeq, a.LocationId, g.CustomerId, g.Status
    FROM #Groups g
        JOIN #Anchors a ON a.AnchorSeq = g.AnchorSeq
) AS src ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (LocationId, CustomerId, Status, CreatedBy)
    VALUES (src.LocationId, src.CustomerId, src.Status, src.CustomerId)
OUTPUT src.GroupSeq, inserted.Id INTO #BookingIds (GroupSeq, BookingId);

UPDATE g SET g.BookingId = bi.BookingId
FROM #Groups g
    JOIN #BookingIds bi ON bi.GroupSeq = g.GroupSeq;

-- ===== BookingTreatments (~1,000,000 lines) =====
-- Each line's absolute start time = its group's shift-relative start offset (packed back-to-back
-- against every earlier group in the same anchor/day) + its own position within the group (packed
-- back-to-back against every earlier line in the same booking). Cancelled bookings null out
-- RoomId/TherapistId/StartTime/EndTime/ExpiresAt on confirm-cancel, exactly like sp_Booking_Cancel
-- does for a live cancellation -- Price/SlotCount/TreatmentPriceId/TreatmentDurationId stay as the
-- historical record of what was booked.
;WITH LineOffsets AS (
    SELECT ld.*,
        SUM(ld.DurationMinutes) OVER (PARTITION BY ld.GroupSeq ORDER BY ld.LineSeqInGroup ROWS UNBOUNDED PRECEDING) - ld.DurationMinutes AS LineStartOffsetInGroup
    FROM #LineDetail ld
),
LineTimes AS (
    SELECT lo.*, g.BookingId, g.Status, g.ExpiresAt, g.GroupStartOffsetMinutes,
        a.RoomId, a.TherapistId, a.ShiftStart,
        DATEADD(MINUTE,
            g.GroupStartOffsetMinutes + lo.LineStartOffsetInGroup,
            DATEADD(MINUTE, DATEDIFF(MINUTE, 0, a.ShiftStart), CAST(lo.WorkDate AS DATETIME2))
        ) AS StartTime
    FROM LineOffsets lo
        JOIN #Groups g ON g.GroupSeq = lo.GroupSeq
        JOIN #Anchors a ON a.AnchorSeq = lo.AnchorSeq
)
INSERT INTO dbo.BookingTreatments
    (BookingId, TreatmentId, RoomId, TherapistId, StartTime, EndTime, ExpiresAt, SequenceOrder, SlotCount, Price, TreatmentPriceId, TreatmentDurationId, CreatedBy)
SELECT
    lt.BookingId, lt.TreatmentId,
    CASE WHEN lt.Status = 'Cancelled' THEN NULL ELSE lt.RoomId END,
    CASE WHEN lt.Status = 'Cancelled' THEN NULL ELSE lt.TherapistId END,
    CASE WHEN lt.Status = 'Cancelled' THEN NULL ELSE lt.StartTime END,
    CASE WHEN lt.Status = 'Cancelled' THEN NULL ELSE DATEADD(MINUTE, lt.DurationMinutes, lt.StartTime) END,
    CASE WHEN lt.Status = 'Cancelled' THEN NULL ELSE lt.ExpiresAt END,
    lt.LineSeqInGroup, lt.SlotCount, lt.Price, lt.TreatmentPriceId, lt.TreatmentDurationId,
    g2.CustomerId
FROM LineTimes lt
    JOIN #Groups g2 ON g2.GroupSeq = lt.GroupSeq;

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
    (SELECT COUNT(*) FROM #Rooms)                            AS RoomsInserted,
    (SELECT COUNT(*) FROM #Categories)                      AS CategoriesInserted,
    (SELECT COUNT(*) FROM #Treatments)                      AS TreatmentsInserted,
    (SELECT COUNT(*) FROM #Therapists)                      AS TherapistsInserted,
    (SELECT COUNT(*) FROM dbo.Users WHERE Role IN ('SuperAdmin','Admin','Manager')) AS StaffUsersInserted,
    (SELECT COUNT(*) FROM #Customers)                       AS CustomersInserted,
    @DayCount                                                AS DaysOfScheduling,
    (SELECT COUNT(*) FROM dbo.ShiftAssignments)             AS TotalShiftAssignments,
    (SELECT COUNT(*) FROM dbo.RoomCategoryAssignments)      AS TotalRoomCategoryAssignments,
    (SELECT COUNT(*) FROM #Groups)                          AS TotalBookings,
    (SELECT COUNT(*) FROM #Groups WHERE Status = 'Confirmed') AS ConfirmedBookings,
    (SELECT COUNT(*) FROM #Groups WHERE Status = 'Cancelled') AS CancelledBookings,
    (SELECT COUNT(*) FROM #Groups WHERE Status = 'Draft' AND ExpiresAt > SYSUTCDATETIME()) AS DraftActiveHoldBookings,
    (SELECT COUNT(*) FROM #Groups WHERE Status = 'Draft' AND ExpiresAt <= SYSUTCDATETIME()) AS DraftExpiredHoldBookings,
    (SELECT COUNT(*) FROM dbo.BookingTreatments)            AS TotalBookingTreatments,
    (SELECT COUNT(*) FROM dbo.BookingTreatments bt JOIN #Groups g ON g.BookingId = bt.BookingId WHERE g.GroupStartOffsetMinutes = 0 AND bt.SequenceOrder = 1) AS LinesStartingExactlyAtShiftOpen,
    (SELECT COUNT(*) FROM dbo.BookingTreatments WHERE EndTime IS NOT NULL AND CAST(EndTime AS TIME) < CAST(StartTime AS TIME)) AS LinesRunningPastMidnight,
    (SELECT COUNT(*) FROM dbo.ShiftAssignments) + (SELECT COUNT(*) FROM dbo.RoomCategoryAssignments) + (SELECT COUNT(*) FROM #Treatments) + (SELECT COUNT(*) FROM #Rooms) + (SELECT COUNT(*) FROM dbo.BookingTreatments) AS TotalDataRowsGenerated;
