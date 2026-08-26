-- PostgreSQL 18+ port of db/sql-server/seed/05_seed_bulk.sql.
-- Bulk demo/QA seed data (v2), additive on top of 01_table_postgres/02_types_postgres/
-- 03_procs_postgres/04_seed_postgres -- run after those. Not idempotent (re-running duplicates
-- everything), same convention as the original. Every staff user below carries a placeholder
-- PasswordHash/Salt (a single 0x00 byte) -- can't log in as-is; reset it (or run a real
-- password-reset flow) before using these accounts.
--
-- Scope, per the original request (unchanged):
--   2 RootSuperAdmin.
--   10 saloons, 5 locations each (50 total), 2 SuperAdmin + 3 Admin per saloon.
--   Per location: 5-10 therapists (cycles 5,6,7,8,9,10 across locations), 2 managers, 5 receptionists,
--   10 categories, 25 treatments/category (3 effective-dated prices each), rooms = therapist count
--   (5-10) so every therapist pairs 1:1 with its own room.
--
-- Port notes:
-- * T-SQL's recursive "#Tally" (1..135) reused for every "N per X" loop, and the "sys.all_columns
--   cross join" trick for 500,000 sequential customer numbers, both -> generate_series(). No
--   recursion, no temp tally table needed at all.
-- * T-SQL's `MERGE ... USING (...) AS src ON 1 = 0 WHEN NOT MATCHED THEN INSERT ... OUTPUT
--   src.Seq, inserted.Id INTO #dest` pattern exists purely to correlate a newly-generated identity
--   back to its source row. Postgres has no OUTPUT-with-source-columns; `INSERT ... RETURNING`
--   only echoes the inserted row's own columns. Rather than lean on "RETURNING preserves the
--   SELECT's row order" (true in practice for a single non-parallel INSERT, but undocumented),
--   every correlation below joins back on a natural key that's already a column of the inserted
--   row itself (Name, or a composite (LocationId, Name)/(LocationId, Ordinal) where Name alone
--   isn't globally unique, or TherapistId for the therapist-login Users rows, since
--   Users.TherapistId is a real column). Robust regardless of execution order.
-- * TRY/CATCH + BEGIN TRAN/ROLLBACK/COMMIT -> a single BEGIN;/COMMIT; wrapping the whole script.
--   Postgres aborts the whole transaction on any statement error, same net effect as the T-SQL
--   CATCH block's ROLLBACK + re-THROW.
SET search_path TO public;

BEGIN;

DO $$
DECLARE
    v_today date := (now() AT TIME ZONE 'utc')::date;
    v_day_count int := 135;
    v_seed_hash bytea := '\x00';  -- placeholder -- not a valid login until reset
    v_seed_salt bytea := '\x00';
    v_root_admin_id int;
BEGIN

-- ===== 0) Root Super Admins (2) =====
CREATE TEMP TABLE tmp_root_admins (Id int);
WITH ins AS (
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified)
    VALUES
        ('Root Super Admin 1', 'rootsuperadmin1@saloonchains.dev', v_seed_hash, v_seed_salt, 'RootSuperAdmin', TRUE),
        ('Root Super Admin 2', 'rootsuperadmin2@saloonchains.dev', v_seed_hash, v_seed_salt, 'RootSuperAdmin', TRUE)
    RETURNING Id
)
INSERT INTO tmp_root_admins SELECT Id FROM ins;

SELECT MIN(Id) INTO v_root_admin_id FROM tmp_root_admins;

-- ===== 1) Saloon Chains (10) =====
CREATE TEMP TABLE tmp_chains (ChainId int NOT NULL, Name text NOT NULL);
WITH brand_names (Seq, Name) AS (
    VALUES (1, 'Velvet & Vine'), (2, 'Golden Hour'), (3, 'Champagne Room'), (4, 'Silver Lining'),
           (5, 'Marble & Moss'), (6, 'The Glow House'), (7, 'Ember & Oak'), (8, 'Lotus Retreat'),
           (9, 'Ivory Lane'), (10, 'Azure Studio')
),
src AS (
    SELECT Name || ' Saloons' AS Name FROM brand_names
),
ins AS (
    INSERT INTO public.SaloonChains (Name, CreatedBy)
    SELECT Name, v_root_admin_id FROM src
    RETURNING Id, Name
)
INSERT INTO tmp_chains (ChainId, Name)
SELECT Id, Name FROM ins;

-- ===== 2) Locations (5 per saloon = 50) =====
CREATE TEMP TABLE tmp_location_spec (ChainId int NOT NULL, Name text NOT NULL, Seq int NOT NULL);
WITH city_names (Seq, City) AS (
    VALUES (1, 'Downtown'), (2, 'Uptown'), (3, 'Westside'), (4, 'Eastside'), (5, 'Northside')
)
INSERT INTO tmp_location_spec (ChainId, Name, Seq)
SELECT c.ChainId, c.Name || ' - ' || cn.City || ' Branch', row_number() OVER ()
FROM tmp_chains c CROSS JOIN city_names cn;

CREATE TEMP TABLE tmp_locations (LocationId int NOT NULL, ChainId int NOT NULL, TherapistCount int NOT NULL);
WITH src AS (
    SELECT ChainId, Name, 5 + ((Seq - 1) % 6) AS TherapistCount FROM tmp_location_spec
),
ins AS (
    INSERT INTO public.Locations (ChainId, Name, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId, CreatedBy)
    SELECT ChainId, Name, '09:00', '20:00', 127, 'UTC', v_root_admin_id FROM src
    RETURNING Id, Name
)
INSERT INTO tmp_locations (LocationId, ChainId, TherapistCount)
SELECT ins.Id, src.ChainId, src.TherapistCount
FROM src JOIN ins ON ins.Name = src.Name;

-- ===== 3) SuperAdmin (2/chain) + Admin (3/chain) staff =====
INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, IsEmailVerified)
SELECT 'Super Admin ' || t.n || ' - ' || c.Name,
    'superadmin' || t.n || '.chain' || c.ChainId || '@saloonchains.dev',
    v_seed_hash, v_seed_salt, 'SuperAdmin', c.ChainId, TRUE
FROM tmp_chains c CROSS JOIN generate_series(1, 2) AS t(n);

INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, IsEmailVerified)
SELECT 'Admin ' || t.n || ' - ' || c.Name,
    'admin' || t.n || '.chain' || c.ChainId || '@saloonchains.dev',
    v_seed_hash, v_seed_salt, 'Admin', c.ChainId, TRUE
FROM tmp_chains c CROSS JOIN generate_series(1, 3) AS t(n);

-- ===== 4) Manager (2/location) + Receptionist (5/location) staff =====
INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, LocationId, IsEmailVerified)
SELECT 'Manager ' || t.n || ' - Loc ' || l.LocationId,
    'manager' || t.n || '.loc' || l.LocationId || '@saloonchains.dev',
    v_seed_hash, v_seed_salt, 'Manager', l.ChainId, l.LocationId, TRUE
FROM tmp_locations l CROSS JOIN generate_series(1, 2) AS t(n);

INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, LocationId, IsEmailVerified)
SELECT 'Receptionist ' || t.n || ' - Loc ' || l.LocationId,
    'receptionist' || t.n || '.loc' || l.LocationId || '@saloonchains.dev',
    v_seed_hash, v_seed_salt, 'Receptionist', l.ChainId, l.LocationId, TRUE
FROM tmp_locations l CROSS JOIN generate_series(1, 5) AS t(n);

-- ===== 5) Rooms (= TherapistCount per location, 5-10, always >= the 3-room floor) =====
CREATE TEMP TABLE tmp_room_spec (LocationId int NOT NULL, Ordinal int NOT NULL, Name text NOT NULL);
INSERT INTO tmp_room_spec (LocationId, Ordinal, Name)
SELECT l.LocationId, t.n, 'Room ' || t.n
FROM tmp_locations l CROSS JOIN generate_series(1, 10) AS t(n)
WHERE t.n <= l.TherapistCount;

CREATE TEMP TABLE tmp_rooms (RoomId int NOT NULL, LocationId int NOT NULL, Ordinal int NOT NULL);
WITH ins AS (
    INSERT INTO public.Rooms (LocationId, Name, CreatedBy)
    SELECT LocationId, Name, v_root_admin_id FROM tmp_room_spec
    RETURNING Id, LocationId, Name
)
INSERT INTO tmp_rooms (RoomId, LocationId, Ordinal)
SELECT ins.Id, ins.LocationId, spec.Ordinal
FROM ins JOIN tmp_room_spec spec ON spec.LocationId = ins.LocationId AND spec.Name = ins.Name;

-- ===== 6) Treatment Categories (10 per location) =====
CREATE TEMP TABLE tmp_category_spec (LocationId int NOT NULL, Ordinal int NOT NULL, Name text NOT NULL);
WITH category_names (Ordinal, Name) AS (
    VALUES (1, 'Hair Care'), (2, 'Nail Care'), (3, 'Spa & Massage'), (4, 'Skin Care'), (5, 'Makeup & Beauty'),
           (6, 'Barbering'), (7, 'Wellness & Fitness'), (8, 'Bridal Services'), (9, 'Kids Care'), (10, 'Waxing & Threading')
)
INSERT INTO tmp_category_spec (LocationId, Ordinal, Name)
SELECT l.LocationId, cn.Ordinal, cn.Name
FROM tmp_locations l CROSS JOIN category_names cn;

CREATE TEMP TABLE tmp_categories (CategoryId int NOT NULL, LocationId int NOT NULL, Ordinal int NOT NULL);
WITH ins AS (
    INSERT INTO public.TreatmentCategories (LocationId, Name, CreatedBy)
    SELECT LocationId, Name, v_root_admin_id FROM tmp_category_spec
    RETURNING Id, LocationId, Name
)
INSERT INTO tmp_categories (CategoryId, LocationId, Ordinal)
SELECT ins.Id, ins.LocationId, spec.Ordinal
FROM ins JOIN tmp_category_spec spec ON spec.LocationId = ins.LocationId AND spec.Name = ins.Name;

-- ===== 7) Treatments (25 per category = 12,500) + 3 effective-dated prices/durations each =====
CREATE TEMP TABLE tmp_treatment_spec (
    CategoryId int NOT NULL, LocationId int NOT NULL, Ordinal int NOT NULL,
    Name text NOT NULL, BasePrice numeric(10,2) NOT NULL, DurationSlots smallint NOT NULL
);
WITH category_names (Ordinal, Name) AS (
    VALUES (1, 'Hair Care'), (2, 'Nail Care'), (3, 'Spa & Massage'), (4, 'Skin Care'), (5, 'Makeup & Beauty'),
           (6, 'Barbering'), (7, 'Wellness & Fitness'), (8, 'Bridal Services'), (9, 'Kids Care'), (10, 'Waxing & Threading')
)
INSERT INTO tmp_treatment_spec (CategoryId, LocationId, Ordinal, Name, BasePrice, DurationSlots)
SELECT c.CategoryId, c.LocationId, t.n,
    cn.Name || ' Treatment ' || lpad(t.n::text, 2, '0'),
    10 + (t.n * 4) + (c.Ordinal * 2),
    2 + ((t.n * 3) % 18)
FROM tmp_categories c
    JOIN category_names cn ON cn.Ordinal = c.Ordinal
    CROSS JOIN generate_series(1, 25) AS t(n);

CREATE TEMP TABLE tmp_treatments (TreatmentId int NOT NULL, LocationId int NOT NULL, BasePrice numeric(10,2) NOT NULL, DurationSlots smallint NOT NULL);
WITH ins AS (
    INSERT INTO public.Treatments (LocationId, CategoryId, Name, CreatedBy)
    SELECT LocationId, CategoryId, Name, v_root_admin_id FROM tmp_treatment_spec
    RETURNING Id, LocationId, Name
)
INSERT INTO tmp_treatments (TreatmentId, LocationId, BasePrice, DurationSlots)
SELECT ins.Id, ins.LocationId, spec.BasePrice, spec.DurationSlots
FROM ins JOIN tmp_treatment_spec spec ON spec.LocationId = ins.LocationId AND spec.Name = ins.Name;

-- 3 effective-dated prices per treatment: older = cheaper (price rose over time).
INSERT INTO public.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy)
SELECT tr.TreatmentId, ROUND(tr.BasePrice * o.Factor, 2), v_today - o.DaysAgo, v_root_admin_id
FROM tmp_treatments tr
    CROSS JOIN (VALUES (90, 0.80), (45, 0.90), (0, 1.00)) AS o(DaysAgo, Factor);

INSERT INTO public.TreatmentDurations (TreatmentId, DurationSlots, EffectiveFrom, CreatedBy)
SELECT TreatmentId, DurationSlots, v_today, v_root_admin_id
FROM tmp_treatments;

-- ===== 8) Therapists (5-10/location) -- TherapistProfile + a Therapist-role login each, linked both ways =====
CREATE TEMP TABLE tmp_therapist_spec (LocationId int NOT NULL, ChainId int NOT NULL, Ordinal int NOT NULL, Name text NOT NULL);
INSERT INTO tmp_therapist_spec (LocationId, ChainId, Ordinal, Name)
SELECT l.LocationId, l.ChainId, t.n, 'Therapist ' || t.n || ' - Loc ' || l.LocationId
FROM tmp_locations l CROSS JOIN generate_series(1, 10) AS t(n)
WHERE t.n <= l.TherapistCount;

CREATE TEMP TABLE tmp_therapists (TherapistId int NOT NULL, LocationId int NOT NULL, Ordinal int NOT NULL, Name text NOT NULL);
WITH ins AS (
    INSERT INTO public.TherapistProfile (Name, ChainId, LocationId, CreatedBy)
    SELECT Name, ChainId, LocationId, v_root_admin_id FROM tmp_therapist_spec
    RETURNING Id, LocationId, Name
)
INSERT INTO tmp_therapists (TherapistId, LocationId, Ordinal, Name)
SELECT ins.Id, ins.LocationId, spec.Ordinal, spec.Name
FROM ins JOIN tmp_therapist_spec spec ON spec.LocationId = ins.LocationId AND spec.Name = ins.Name;

CREATE TEMP TABLE tmp_therapist_users (TherapistId int NOT NULL, UserId int NOT NULL);
WITH ins AS (
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, ChainId, LocationId, TherapistId, IsEmailVerified)
    SELECT th.Name, 'therapist' || th.Ordinal || '.loc' || th.LocationId || '@saloonchains.dev',
        v_seed_hash, v_seed_salt, 'Therapist', l.ChainId, th.LocationId, th.TherapistId, TRUE
    FROM tmp_therapists th
        JOIN tmp_locations l ON l.LocationId = th.LocationId
    RETURNING Id, TherapistId
)
INSERT INTO tmp_therapist_users (TherapistId, UserId)
SELECT TherapistId, Id FROM ins;

UPDATE public.TherapistProfile tp
SET UserId = tu.UserId
FROM tmp_therapist_users tu
WHERE tu.TherapistId = tp.Id;

-- ===== 9) "Opened room" data: ShiftAssignments + RoomCategoryAssignments, paired 1:1 on
-- (Room, ShiftType, WorkDate) -- room<->therapist bijection by Ordinal within each location
-- (RoomCount == TherapistCount there), x 2 shifts x 135 days = ~100,170 rows in each table. =====
CREATE TEMP TABLE tmp_room_therapist_pairs (LocationId int NOT NULL, RoomId int NOT NULL, TherapistId int NOT NULL, RoomOrdinal int NOT NULL);
INSERT INTO tmp_room_therapist_pairs (LocationId, RoomId, TherapistId, RoomOrdinal)
SELECT r.LocationId, r.RoomId, th.TherapistId, r.Ordinal
FROM tmp_rooms r
    JOIN tmp_therapists th ON th.LocationId = r.LocationId AND th.Ordinal = r.Ordinal;

INSERT INTO public.ShiftAssignments (LocationId, TherapistId, RoomId, ShiftType, WorkDate, StartTime, EndTime, CreatedBy)
SELECT p.LocationId, p.TherapistId, p.RoomId, x.ShiftType, v_today + (t.n - 1),
    CASE x.ShiftType WHEN 'Morning' THEN '09:00'::time ELSE '14:00'::time END,
    CASE x.ShiftType WHEN 'Morning' THEN '13:00'::time ELSE '20:00'::time END,
    v_root_admin_id
FROM tmp_room_therapist_pairs p
    CROSS JOIN (VALUES ('Morning'), ('Evening')) AS x(ShiftType)
    CROSS JOIN generate_series(1, v_day_count) AS t(n);

INSERT INTO public.RoomCategoryAssignments (RoomId, TreatmentCategoryId, ShiftType, WorkDate, CreatedBy)
SELECT p.RoomId, c.CategoryId, x.ShiftType, v_today + (t.n - 1), v_root_admin_id
FROM tmp_room_therapist_pairs p
    CROSS JOIN (VALUES ('Morning'), ('Evening')) AS x(ShiftType)
    CROSS JOIN generate_series(1, v_day_count) AS t(n)
    JOIN tmp_categories c ON c.LocationId = p.LocationId AND c.Ordinal = ((p.RoomOrdinal + t.n) % 10) + 1;

-- ===== Phase 3 Seed Data: Suppliers, Products, Purchase Orders, Commission Rules, Pay Runs =====

-- 1. Suppliers (2 per chain)
CREATE TEMP TABLE tmp_suppliers (ChainId int NOT NULL, SupplierId int NOT NULL, Name text NOT NULL);

WITH ins AS (
    INSERT INTO public.Suppliers (ChainId, Name, ContactEmail, ContactPhone, CreatedBy)
    SELECT c.ChainId, 'L''Oréal Professional Supplies', 'orders@loreal-saloon.com', '+1-800-555-0199', v_root_admin_id
    FROM tmp_chains c
    RETURNING Id, ChainId, Name
)
INSERT INTO tmp_suppliers (ChainId, SupplierId, Name)
SELECT ChainId, Id, Name FROM ins;

WITH ins AS (
    INSERT INTO public.Suppliers (ChainId, Name, ContactEmail, ContactPhone, CreatedBy)
    SELECT c.ChainId, 'OPI Beauty & Wellness', 'supply@opibeauty.com', '+1-800-555-0122', v_root_admin_id
    FROM tmp_chains c
    RETURNING Id, ChainId, Name
)
INSERT INTO tmp_suppliers (ChainId, SupplierId, Name)
SELECT ChainId, Id, Name FROM ins;

-- 2. Products (4 per location -- 2 low-stock to test thresholds)
INSERT INTO public.Products (LocationId, SupplierId, Name, SKU, Price, QuantityOnHand, ReorderThreshold, CreatedBy)
SELECT l.LocationId, sup.SupplierId, 'Argan Repair Hair Serum 100ml', 'SKU-HAIR-01', 35.00, 18, 5, v_root_admin_id
FROM tmp_locations l JOIN tmp_suppliers sup ON sup.ChainId = l.ChainId AND sup.Name LIKE 'L''Oréal%';

INSERT INTO public.Products (LocationId, SupplierId, Name, SKU, Price, QuantityOnHand, ReorderThreshold, CreatedBy)
SELECT l.LocationId, sup.SupplierId, 'Keratin Deep Moisture Shampoo', 'SKU-HAIR-02', 28.00, 3, 5, v_root_admin_id -- Low stock (3 <= 5)
FROM tmp_locations l JOIN tmp_suppliers sup ON sup.ChainId = l.ChainId AND sup.Name LIKE 'L''Oréal%';

INSERT INTO public.Products (LocationId, SupplierId, Name, SKU, Price, QuantityOnHand, ReorderThreshold, CreatedBy)
SELECT l.LocationId, sup.SupplierId, 'Nail & Cuticle Restorative Oil', 'SKU-NAIL-01', 19.50, 24, 5, v_root_admin_id
FROM tmp_locations l JOIN tmp_suppliers sup ON sup.ChainId = l.ChainId AND sup.Name LIKE 'OPI%';

INSERT INTO public.Products (LocationId, SupplierId, Name, SKU, Price, QuantityOnHand, ReorderThreshold, CreatedBy)
SELECT l.LocationId, sup.SupplierId, 'Hydrating Facial Sheet Mask 5-Pack', 'SKU-FACE-01', 22.00, 2, 5, v_root_admin_id -- Low stock (2 <= 5)
FROM tmp_locations l JOIN tmp_suppliers sup ON sup.ChainId = l.ChainId AND sup.Name LIKE 'OPI%';

-- 3. Commission Rules (1 location default + 1 specific therapist rule per location)
INSERT INTO public.CommissionRules (LocationId, TherapistId, Type, Rate, HourlyRate, OvertimeThresholdHours, OvertimeRateMultiplier, CreatedBy)
SELECT l.LocationId, NULL, 'Percent', 15.00, 20.00, 40.00, 1.50, v_root_admin_id
FROM tmp_locations l;

INSERT INTO public.CommissionRules (LocationId, TherapistId, Type, Rate, HourlyRate, OvertimeThresholdHours, OvertimeRateMultiplier, CreatedBy)
SELECT l.LocationId, t.TherapistId, 'Hourly', 25.00, 25.00, 35.00, 1.50, v_root_admin_id
FROM tmp_locations l
    JOIN LATERAL (SELECT TherapistId FROM tmp_therapists WHERE LocationId = l.LocationId ORDER BY TherapistId LIMIT 1) t ON TRUE;

-- ===== Bulk Customers (500,000) =====
INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified, CreatedDate)
SELECT
    'Bulk Customer ' || n,
    'bulkcustomer' || n || '@saloonchains.dev',
    v_seed_hash, v_seed_salt, 'Customer', TRUE, now() - (n || ' seconds')::interval
FROM generate_series(1, 500000) AS n;

-- ===== Seed Bookings (150 Confirmed Bookings with Treatments, Payments, Products & Location Binds) =====
CREATE TEMP TABLE tmp_treatment_sample (rn int NOT NULL, TreatmentId int NOT NULL, LocationId int NOT NULL, DurationSlots smallint NOT NULL, BasePrice numeric(10,2) NOT NULL, RoomId int NOT NULL, TherapistId int NOT NULL);
INSERT INTO tmp_treatment_sample (rn, TreatmentId, LocationId, DurationSlots, BasePrice, RoomId, TherapistId)
SELECT rn, TreatmentId, LocationId, DurationSlots, BasePrice, RoomId, TherapistId
FROM (
    SELECT tr.TreatmentId, tr.LocationId, tr.DurationSlots, tr.BasePrice,
        r.RoomId, th.TherapistId,
        row_number() OVER (ORDER BY tr.TreatmentId) AS rn
    FROM tmp_treatments tr
        JOIN tmp_rooms r ON r.LocationId = tr.LocationId AND r.Ordinal = 1
        JOIN tmp_therapists th ON th.LocationId = tr.LocationId AND th.Ordinal = 1
) x
WHERE rn <= 150;

CREATE TEMP TABLE tmp_customer_sample (rn int NOT NULL, CustomerId int NOT NULL);
INSERT INTO tmp_customer_sample (rn, CustomerId)
SELECT row_number() OVER (ORDER BY Id DESC), Id
FROM (SELECT Id FROM public.Users WHERE Role = 'Customer' ORDER BY Id DESC LIMIT 150) c;

CREATE TEMP TABLE tmp_seed_bookings (BookingId int NOT NULL, CustomerId int NOT NULL, LocationId int NOT NULL, TreatmentId int NOT NULL, RoomId int NOT NULL, TherapistId int NOT NULL, Price numeric(10,2) NOT NULL, DurationSlots smallint NOT NULL, StartTime timestamptz NOT NULL);

WITH pairs AS (
    SELECT cs.rn, cs.CustomerId, ts.LocationId, ts.TreatmentId, ts.RoomId, ts.TherapistId, ts.BasePrice, ts.DurationSlots
    FROM tmp_customer_sample cs
        JOIN tmp_treatment_sample ts ON ts.rn = ((cs.rn - 1) % 150) + 1
),
ins AS (
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate)
    SELECT LocationId, CustomerId, 'Confirmed', v_root_admin_id, now() - ((rn % 30) || ' days')::interval
    FROM pairs
    RETURNING Id, CustomerId
)
INSERT INTO tmp_seed_bookings (BookingId, CustomerId, LocationId, TreatmentId, RoomId, TherapistId, Price, DurationSlots, StartTime)
SELECT ins.Id, ins.CustomerId, p.LocationId, p.TreatmentId, p.RoomId, p.TherapistId, p.BasePrice, p.DurationSlots,
    ((v_today - (p.rn % 30))::timestamp + ((9 + (p.rn % 8)) || ' hours')::interval) AT TIME ZONE 'utc'
FROM ins JOIN pairs p ON p.CustomerId = ins.CustomerId;

INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, SlotCount, Price, CreatedBy)
SELECT sb.BookingId, sb.TreatmentId, sb.RoomId, sb.TherapistId, 1,
    sb.StartTime, sb.StartTime + (sb.DurationSlots * 15 || ' minutes')::interval, sb.DurationSlots, sb.Price, v_root_admin_id
FROM tmp_seed_bookings sb;

INSERT INTO public.Payments (BookingId, Amount, TipAmount, Currency, Provider, PaymentMethod, Status, TransactionId, CreatedBy)
SELECT sb.BookingId, sb.Price, 5.00, 'USD', 'Stripe', 'card', 'Succeeded', 'tx_bulkseed_' || sb.BookingId, v_root_admin_id
FROM tmp_seed_bookings sb;

INSERT INTO public.CustomerLocations (CustomerId, LocationId, CreatedBy)
SELECT DISTINCT sb.CustomerId, sb.LocationId, v_root_admin_id
FROM tmp_seed_bookings sb
WHERE NOT EXISTS (
    SELECT 1 FROM public.CustomerLocations cl WHERE cl.CustomerId = sb.CustomerId AND cl.LocationId = sb.LocationId AND cl.IsDelete = FALSE
);

-- Move the summary-report inputs into a table that survives past this DO block (temp tables are
-- session-scoped, not block-scoped, so they're already visible afterward -- this just keeps the
-- root admin id around too since a DO block can't return values to the caller).
CREATE TEMP TABLE tmp_seed_summary (RootAdminId int, DayCount int);
INSERT INTO tmp_seed_summary VALUES (v_root_admin_id, v_day_count);

END $$;

COMMIT;

-- ===== Summary Report =====
SELECT
    (SELECT COUNT(*) FROM tmp_root_admins)                       AS RootSuperAdminsInserted,
    (SELECT COUNT(*) FROM tmp_chains)                            AS SaloonsInserted,
    (SELECT COUNT(*) FROM tmp_locations)                         AS LocationsInserted,
    (SELECT COUNT(*) FROM public.Users WHERE Role = 'SuperAdmin' AND ChainId IN (SELECT ChainId FROM tmp_chains)) AS SuperAdminsInserted,
    (SELECT COUNT(*) FROM public.Users WHERE Role = 'Admin' AND ChainId IN (SELECT ChainId FROM tmp_chains))      AS AdminsInserted,
    (SELECT COUNT(*) FROM public.Users WHERE Role = 'Manager' AND LocationId IN (SELECT LocationId FROM tmp_locations))      AS ManagersInserted,
    (SELECT COUNT(*) FROM public.Users WHERE Role = 'Receptionist' AND LocationId IN (SELECT LocationId FROM tmp_locations)) AS ReceptionistsInserted,
    (SELECT COUNT(*) FROM public.Users WHERE Role = 'Customer')  AS CustomersInserted,
    (SELECT COUNT(*) FROM tmp_rooms)                             AS RoomsInserted,
    (SELECT COUNT(*) FROM tmp_categories)                        AS CategoriesInserted,
    (SELECT COUNT(*) FROM tmp_treatments)                        AS TreatmentsInserted,
    (SELECT COUNT(*) FROM public.TreatmentPrices WHERE TreatmentId IN (SELECT TreatmentId FROM tmp_treatments))    AS TreatmentPricesInserted,
    (SELECT COUNT(*) FROM tmp_therapists)                        AS TherapistsInserted,
    (SELECT COUNT(*) FROM tmp_therapist_users)                   AS TherapistUsersInserted,
    (SELECT COUNT(*) FROM tmp_seed_bookings)                     AS BookingsInserted,
    (SELECT DayCount FROM tmp_seed_summary)                      AS DaysOfScheduling,
    (SELECT COUNT(*) FROM tmp_room_therapist_pairs)              AS RoomTherapistPairsPerDayShift,
    (SELECT COUNT(*) FROM public.ShiftAssignments WHERE LocationId IN (SELECT LocationId FROM tmp_locations))           AS TotalShiftAssignments,
    (SELECT COUNT(*) FROM public.RoomCategoryAssignments WHERE RoomId IN (SELECT RoomId FROM tmp_rooms))                AS TotalOpenedRoomRecords;

-- =====================================================================================
-- ===== E2E coverage pass: every status/branch the 03_procs_postgres.sql routines  =====
-- ===== actually check, layered onto the bulk data above. Anchored on the first     =====
-- ===== chain/location the bulk section created (still in-session temp tables), so  =====
-- ===== no hardcoded names/ids. Not idempotent, same convention as the rest of this =====
-- ===== file -- re-running duplicates everything below too.                        =====
-- =====================================================================================
BEGIN;

DO $$
DECLARE
    v_today date := (now() AT TIME ZONE 'utc')::date;
    v_now timestamptz := now();
    v_seed_hash bytea := '\x00';
    v_seed_salt bytea := '\x00';

    v_chain_id int;
    v_location_id int;
    v_room1 int;
    v_room2 int;
    v_category_hair int;
    v_category_waxing int;
    v_therapist1 int;
    v_therapist2 int;
    v_treatment1 int;
    v_treatment2 int;
    v_treatment_deactivated int;
    v_treatment1_price numeric(10,2);
    v_treatment1_duration smallint;
    v_treatment2_price numeric(10,2);
    v_treatment2_duration smallint;

    v_root_admin_id int;
    v_superadmin_id int;
    v_manager_id int;
    v_receptionist_id int;
    v_receptionist2_id int;
    v_pool_therapist_id int;

    v_treatment_future int;
    v_supplier_id int;
    v_product_normal int;
    v_product_lowstock int;

    v_status_checkedin int;
    v_status_intreatment int;
    v_cancel_reason_id int;
    v_blocktype_lunch int;
    v_blocktype_custom int;

    v_cust1 int; v_cust2 int; v_cust3 int; v_cust4 int; v_cust5 int; v_cust6 int;

    v_booking_id int;
    v_expires_soon timestamptz;
    v_expires_past timestamptz;
BEGIN
    SELECT MIN(ChainId) INTO v_chain_id FROM tmp_chains;
    SELECT MIN(LocationId) INTO v_location_id FROM tmp_locations WHERE ChainId = v_chain_id;
    SELECT RoomId INTO v_room1 FROM tmp_rooms WHERE LocationId = v_location_id AND Ordinal = 1;
    SELECT RoomId INTO v_room2 FROM tmp_rooms WHERE LocationId = v_location_id AND Ordinal = 2;
    SELECT CategoryId INTO v_category_hair FROM tmp_categories WHERE LocationId = v_location_id AND Ordinal = 1;    -- 'Hair Care'
    SELECT CategoryId INTO v_category_waxing FROM tmp_categories WHERE LocationId = v_location_id AND Ordinal = 10; -- 'Waxing & Threading'
    SELECT TherapistId INTO v_therapist1 FROM tmp_therapists WHERE LocationId = v_location_id AND Ordinal = 1;
    SELECT TherapistId INTO v_therapist2 FROM tmp_therapists WHERE LocationId = v_location_id AND Ordinal = 2;

    SELECT Id INTO v_treatment1 FROM public.Treatments WHERE LocationId = v_location_id AND CategoryId = v_category_hair AND Name = 'Hair Care Treatment 01';
    SELECT Id INTO v_treatment2 FROM public.Treatments WHERE LocationId = v_location_id AND CategoryId = v_category_hair AND Name = 'Hair Care Treatment 02';
    SELECT Id INTO v_treatment_deactivated FROM public.Treatments WHERE LocationId = v_location_id AND CategoryId = v_category_hair AND Name = 'Hair Care Treatment 03';
    SELECT Price INTO v_treatment1_price FROM public.TreatmentPrices WHERE TreatmentId = v_treatment1 AND EffectiveFrom <= v_today ORDER BY EffectiveFrom DESC LIMIT 1;
    SELECT DurationSlots INTO v_treatment1_duration FROM public.TreatmentDurations WHERE TreatmentId = v_treatment1 AND EffectiveFrom <= v_today ORDER BY EffectiveFrom DESC LIMIT 1;
    SELECT Price INTO v_treatment2_price FROM public.TreatmentPrices WHERE TreatmentId = v_treatment2 AND EffectiveFrom <= v_today ORDER BY EffectiveFrom DESC LIMIT 1;
    SELECT DurationSlots INTO v_treatment2_duration FROM public.TreatmentDurations WHERE TreatmentId = v_treatment2 AND EffectiveFrom <= v_today ORDER BY EffectiveFrom DESC LIMIT 1;

    SELECT MIN(Id) INTO v_root_admin_id FROM tmp_root_admins;
    SELECT Id INTO v_superadmin_id FROM public.Users WHERE Role = 'SuperAdmin' AND ChainId = v_chain_id ORDER BY Id LIMIT 1;
    SELECT Id INTO v_manager_id FROM public.Users WHERE Role = 'Manager' AND LocationId = v_location_id ORDER BY Id LIMIT 1;
    SELECT Id INTO v_receptionist_id FROM public.Users WHERE Role = 'Receptionist' AND LocationId = v_location_id ORDER BY Id LIMIT 1;
    SELECT Id INTO v_receptionist2_id FROM public.Users WHERE Role = 'Receptionist' AND LocationId = v_location_id ORDER BY Id OFFSET 1 LIMIT 1;

    SELECT Id INTO v_supplier_id FROM public.Suppliers WHERE ChainId = v_chain_id AND Name LIKE 'L''Oréal%';
    SELECT Id INTO v_product_normal FROM public.Products WHERE LocationId = v_location_id AND SKU = 'SKU-HAIR-01';
    SELECT Id INTO v_product_lowstock FROM public.Products WHERE LocationId = v_location_id AND SKU = 'SKU-HAIR-02';

    SELECT Id INTO v_cancel_reason_id FROM public.CancelReasons WHERE Name = 'Client not available';
    SELECT Id INTO v_blocktype_lunch FROM public.BlockTypes WHERE Name = 'Lunch Break' AND ChainId IS NULL AND LocationId IS NULL;

    ------------------------------------------------------------------------------------------
    -- 1) Staff flags the bulk section never sets: an emulation-eligible SuperAdmin, a
    --    deactivated Receptionist (still keeps 4 active ones at this location), plus an
    --    unassigned "shared pool" therapist (ChainId/LocationId/UserId all NULL, matching
    --    sp_Catalog_GetTherapists' documented legacy/bootstrap fallback).
    ------------------------------------------------------------------------------------------
    UPDATE public.Users SET IsEmulator = TRUE WHERE Id = v_superadmin_id;
    UPDATE public.Users SET IsActive = FALSE WHERE Id = v_receptionist2_id;
    INSERT INTO public.TherapistProfile (Name) VALUES ('Unassigned Pool Therapist') RETURNING Id INTO v_pool_therapist_id;
    INSERT INTO public.StaffProfiles (UserId, PhotoPath) VALUES (v_manager_id, '/uploads/staff/' || v_manager_id || '/avatar.jpg');

    ------------------------------------------------------------------------------------------
    -- 2) Catalog branches the bulk section never exercises: a whole category deactivated,
    --    one treatment deactivated while its category stays active, a not-yet-live treatment
    --    (future EffectiveFrom), and an already-scheduled future price rise on an existing one.
    ------------------------------------------------------------------------------------------
    UPDATE public.TreatmentCategories SET IsActive = FALSE WHERE Id = v_category_waxing;
    UPDATE public.Treatments SET IsActive = FALSE WHERE Id = v_treatment_deactivated;

    INSERT INTO public.Treatments (LocationId, CategoryId, Name, Description, EffectiveFrom, CreatedBy)
    VALUES (v_location_id, v_category_hair, 'Deluxe Scalp Treatment', 'Launching soon.', v_today + 30, v_manager_id)
    RETURNING Id INTO v_treatment_future;
    INSERT INTO public.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy) VALUES (v_treatment_future, 45.00, v_today + 30, v_manager_id);
    INSERT INTO public.TreatmentDurations (TreatmentId, DurationSlots, EffectiveFrom, CreatedBy) VALUES (v_treatment_future, 8, v_today + 30, v_manager_id);

    INSERT INTO public.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy) VALUES (v_treatment1, v_treatment1_price + 5.00, v_today + 45, v_manager_id);

    ------------------------------------------------------------------------------------------
    -- 3) Purchase orders: Suppliers/Products already exist from the bulk section (including a
    --    pre-flagged low-stock product), but no PurchaseOrders row does yet. One Ordered
    --    (against the low-stock product) and one already-Received.
    ------------------------------------------------------------------------------------------
    DECLARE
        v_po_ordered int;
        v_po_received int;
    BEGIN
        INSERT INTO public.PurchaseOrders (LocationId, SupplierId, Status, CreatedBy)
        VALUES (v_location_id, v_supplier_id, 'Ordered', v_manager_id) RETURNING Id INTO v_po_ordered;
        INSERT INTO public.PurchaseOrderLines (PurchaseOrderId, ProductId, QuantityOrdered, UnitCost)
        VALUES (v_po_ordered, v_product_lowstock, 40, 12.50);

        INSERT INTO public.PurchaseOrders (LocationId, SupplierId, Status, ReceivedDate, CreatedBy)
        VALUES (v_location_id, v_supplier_id, 'Received', v_now - interval '10 days', v_manager_id) RETURNING Id INTO v_po_received;
        INSERT INTO public.PurchaseOrderLines (PurchaseOrderId, ProductId, QuantityOrdered, UnitCost)
        VALUES (v_po_received, v_product_normal, 25, 9.75);
    END;

    ------------------------------------------------------------------------------------------
    -- 4) Pay runs: CommissionRules already exist from the bulk section, but no PayRuns row
    --    does. One Draft, one already-Finalized (so the "already finalized" guard has a row).
    ------------------------------------------------------------------------------------------
    DECLARE
        v_payrun_draft int;
        v_payrun_final int;
    BEGIN
        INSERT INTO public.PayRuns (LocationId, PeriodStart, PeriodEnd, Status, CreatedBy)
        VALUES (v_location_id, v_today - 13, v_today - 7, 'Draft', v_manager_id) RETURNING Id INTO v_payrun_draft;
        INSERT INTO public.PayRunLines (PayRunId, TherapistId, GrossSales, HoursWorked, RegularHours, OvertimeHours, HourlyRate, CommissionRate, CommissionType, CommissionAmount, OvertimePay, TotalPay)
        VALUES (v_payrun_draft, v_therapist1, 620.00, 38.00, 38.00, 0, 25.00, 15.00, 'Percent', 93.00, 0, 93.00);

        INSERT INTO public.PayRuns (LocationId, PeriodStart, PeriodEnd, Status, FinalizedDate, CreatedBy)
        VALUES (v_location_id, v_today - 27, v_today - 21, 'Finalized', v_now - interval '20 days', v_manager_id) RETURNING Id INTO v_payrun_final;
        INSERT INTO public.PayRunLines (PayRunId, TherapistId, GrossSales, HoursWorked, RegularHours, OvertimeHours, HourlyRate, CommissionRate, CommissionType, CommissionAmount, OvertimePay, TotalPay)
        VALUES (v_payrun_final, v_therapist2, 745.00, 44.00, 40.00, 4.00, 25.00, 15.00, 'Percent', 111.75, 150.00, 261.75);
    END;

    ------------------------------------------------------------------------------------------
    -- 5) LocationDaySchedule overrides: one already-in-effect custom-hours day (past
    --    EffectiveFrom -- read-only per sp_Catalog_UpdateLocationDaySchedule's "already in
    --    effect" guard), one still-pending IsClosed override, one still-pending custom-hours one.
    ------------------------------------------------------------------------------------------
    INSERT INTO public.LocationDaySchedule (LocationId, DayBit, OpenTime, CloseTime, IsClosed, EffectiveFrom, EffectiveTo, CreatedBy)
    VALUES
        (v_location_id, public.fn_DayBit(v_today - 30), '10:00', '16:00', FALSE, v_today - 30, v_today - 30, v_manager_id),
        (v_location_id, public.fn_DayBit(v_today + 20), NULL, NULL, TRUE, v_today + 20, v_today + 20, v_manager_id),
        (v_location_id, public.fn_DayBit(v_today + 25), '11:00', '15:00', FALSE, v_today + 25, v_today + 25, v_manager_id);

    ------------------------------------------------------------------------------------------
    -- 6) Custom AppointmentStatuses: one chain-scoped, one location-scoped (alongside the
    --    global Arrived/Complete system rows already seeded by 01_table_postgres.sql).
    ------------------------------------------------------------------------------------------
    INSERT INTO public.AppointmentStatuses (Name, ChainId, ColorHex, SortOrder, CreatedBy)
    VALUES ('Checked In', v_chain_id, '#22C55E', 10, v_manager_id) RETURNING Id INTO v_status_checkedin;
    INSERT INTO public.AppointmentStatuses (Name, LocationId, ColorHex, SortOrder, CreatedBy)
    VALUES ('In Treatment', v_location_id, '#F97316', 20, v_manager_id) RETURNING Id INTO v_status_intreatment;

    ------------------------------------------------------------------------------------------
    -- 7) Custom BlockType + BlockedSlots (the global "Lunch Break" default covers the recurring-
    --    break case already; this adds a one-off block on top of it).
    ------------------------------------------------------------------------------------------
    INSERT INTO public.BlockTypes (Name, ChainId, IsPaid, DefaultDurationMinutes, ColorHex, CreatedBy)
    VALUES ('Deep Clean', v_chain_id, TRUE, 60, '#0EA5E9', v_manager_id) RETURNING Id INTO v_blocktype_custom;

    INSERT INTO public.BlockedSlots (RoomId, BlockTypeId, WorkDate, StartTime, EndTime, Reason, CreatedBy)
    VALUES
        (v_room1, v_blocktype_lunch, v_today + 1, '12:00', '12:30', 'Lunch Break', v_manager_id),
        (v_room2, v_blocktype_custom, v_today + 2, '08:00', '09:00', 'Deep clean before opening', v_manager_id);

    ------------------------------------------------------------------------------------------
    -- 8) Staff attendance: one fully-logged shift (arrival + departure), one arrival-only
    --    (still clocked in). Deliberately does NOT log Therapist 1's arrival today, so
    --    sp_Staff_GetUnattendedPreBookingAlerts has a real unattended-arrival alert to return
    --    against the Confirmed booking scenario (10d) below.
    ------------------------------------------------------------------------------------------
    INSERT INTO public.StaffAttendance (LocationId, UserId, WorkDate, ArrivalTime, LeftTime, CreatedBy)
    VALUES (v_location_id, v_manager_id, v_today, '08:55', '18:05', v_manager_id);
    INSERT INTO public.StaffAttendance (LocationId, UserId, WorkDate, ArrivalTime, CreatedBy)
    VALUES (v_location_id, v_receptionist_id, v_today, '08:50', v_receptionist_id);

    ------------------------------------------------------------------------------------------
    -- 9) A handful of customers with flags the 500,000 bulk customers never carry: unverified
    --    email, walk-in, and a Stripe customer id + profile photo already on file.
    ------------------------------------------------------------------------------------------
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified)
    VALUES ('Avery Stone', 'avery.stone@example.dev', v_seed_hash, v_seed_salt, 'Customer', TRUE) RETURNING Id INTO v_cust1;
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified)
    VALUES ('Bailey Fox', 'bailey.fox@example.dev', v_seed_hash, v_seed_salt, 'Customer', TRUE) RETURNING Id INTO v_cust2;
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified)
    VALUES ('Cameron Reed', 'cameron.reed@example.dev', v_seed_hash, v_seed_salt, 'Customer', FALSE) RETURNING Id INTO v_cust3; -- unverified email
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified, StripeCustomerId, ProfilePhoto)
    VALUES ('Devon Marsh', 'devon.marsh@example.dev', v_seed_hash, v_seed_salt, 'Customer', TRUE, 'cus_seed_devon', '/uploads/customers/devon/avatar.jpg') RETURNING Id INTO v_cust4;
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified)
    VALUES ('Ellis Park', 'ellis.park@example.dev', v_seed_hash, v_seed_salt, 'Customer', TRUE) RETURNING Id INTO v_cust5;
    INSERT INTO public.Users (Name, Email, PasswordHash, PasswordSalt, Role, IsEmailVerified, IsWalkIn)
    VALUES ('Frankie Nolan', 'frankie.nolan@example.dev', v_seed_hash, v_seed_salt, 'Customer', FALSE, TRUE) RETURNING Id INTO v_cust6;

    ------------------------------------------------------------------------------------------
    -- 10) Booking lifecycle variety the bulk section's 150 uniform Confirmed bookings never
    --     cover. Inserted directly (not through the procs) as pre-existing fixture data.
    ------------------------------------------------------------------------------------------

    -- 10a) Unscheduled Draft -- treatments picked, no room/time/therapist yet.
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate)
    VALUES (v_location_id, v_cust1, 'Draft', v_cust1, v_now - interval '5 minutes')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, CreatedBy)
    VALUES (v_booking_id, v_treatment1, 1, v_treatment1_duration, v_treatment1_price, v_cust1);

    -- 10b) Scheduled Draft, hold still valid (ExpiresAt a few minutes from now) -- mid-checkout.
    v_expires_soon := v_now + interval '4 minutes';
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate)
    VALUES (v_location_id, v_cust2, 'Draft', v_cust2, v_now - interval '2 minutes')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, ExpiresAt, SlotCount, Price, CreatedBy)
    VALUES (v_booking_id, v_treatment2, v_room1, v_therapist1, 1,
        (v_today + 1)::timestamp + interval '10 hours', (v_today + 1)::timestamp + interval '10 hours 20 minutes',
        v_expires_soon, v_treatment2_duration, v_treatment2_price, v_cust2);
    INSERT INTO public.Payments (BookingId, Amount, Currency, Provider, PaymentMethod, Status, ClientSecret, CreatedBy)
    VALUES (v_booking_id, v_treatment2_price, 'USD', 'Stripe', 'card', 'RequiresAction', 'seed_secret_' || v_booking_id, v_cust2);

    -- 10c) Scheduled Draft, hold already EXPIRED -- exactly what sp_Booking_ExpireStaleHolds sweeps.
    v_expires_past := v_now - interval '10 minutes';
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate, UpdatedDate)
    VALUES (v_location_id, v_cust3, 'Draft', v_cust3, v_now - interval '20 minutes', v_now - interval '20 minutes')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, ExpiresAt, SlotCount, Price, CreatedBy)
    VALUES (v_booking_id, v_treatment1, v_room2, v_therapist2, 1,
        (v_today + 1)::timestamp + interval '14 hours', (v_today + 1)::timestamp + interval '14 hours 30 minutes',
        v_expires_past, v_treatment1_duration, v_treatment1_price, v_cust3);
    INSERT INTO public.Payments (BookingId, Amount, Currency, Provider, PaymentMethod, Status, ClientSecret, CreatedBy)
    VALUES (v_booking_id, v_treatment1_price, 'USD', 'Stripe', 'card', 'Pending', 'seed_secret_' || v_booking_id, v_cust3);

    -- 10d) Multi-treatment Confirmed booking (2 sequential lines), starting TODAY, with progress
    --      AppointmentStatus set and a retail product add-on -- exercises BookingTreatments'
    --      SequenceOrder ordering, BookingProducts/sp_Booking_GetProducts, and (paired with 8's
    --      missing attendance log for Therapist 1) sp_Staff_GetUnattendedPreBookingAlerts.
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, AppointmentStatusId, CreatedBy, CreatedDate)
    VALUES (v_location_id, v_cust4, 'Confirmed', v_status_checkedin, v_cust4, v_now - interval '3 days')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, SlotCount, Price, CreatedBy)
    VALUES
        (v_booking_id, v_treatment1, v_room1, v_therapist1, 1,
            v_now + interval '20 minutes', v_now + interval '20 minutes' + (v_treatment1_duration * 15 || ' minutes')::interval, v_treatment1_duration, v_treatment1_price, v_cust4),
        (v_booking_id, v_treatment2, v_room1, v_therapist1, 2,
            v_now + interval '20 minutes' + (v_treatment1_duration * 15 || ' minutes')::interval,
            v_now + interval '20 minutes' + ((v_treatment1_duration + v_treatment2_duration) * 15 || ' minutes')::interval,
            v_treatment2_duration, v_treatment2_price, v_cust4);
    INSERT INTO public.BookingProducts (BookingId, ProductId, Quantity, UnitPrice, CreatedBy)
    VALUES (v_booking_id, v_product_normal, 1, 35.00, v_cust4);
    INSERT INTO public.Payments (BookingId, Amount, TipAmount, Currency, Provider, PaymentMethod, Status, TransactionId, CreatedBy)
    VALUES (v_booking_id, v_treatment1_price + v_treatment2_price, 8.00, 'USD', 'Stripe', 'card', 'Succeeded', 'tx_seed_e2e_' || v_booking_id, v_cust4);
    INSERT INTO public.CustomerLocations (CustomerId, LocationId, CreatedBy)
    SELECT v_cust4, v_location_id, v_cust4
    WHERE NOT EXISTS (SELECT 1 FROM public.CustomerLocations WHERE CustomerId = v_cust4 AND LocationId = v_location_id AND IsDelete = FALSE);

    -- 10e) Confirmed + already ended, review-eligible (no Review row yet) -- with a proxy
    --      therapist reassigned on the line (staff-unavailable scenario), paid Cash.
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate)
    VALUES (v_location_id, v_cust5, 'Confirmed', v_cust5, v_now - interval '20 days')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, ProxyTherapistId, SequenceOrder, StartTime, EndTime, SlotCount, Price, CreatedBy)
    VALUES (v_booking_id, v_treatment1, v_room1, v_therapist1, v_manager_id, 1,
        v_now - interval '18 days', v_now - interval '18 days' + (v_treatment1_duration * 15 || ' minutes')::interval, v_treatment1_duration, v_treatment1_price, v_cust5);
    INSERT INTO public.Payments (BookingId, Amount, Currency, Provider, PaymentMethod, Status, AmountTendered, CreatedBy)
    VALUES (v_booking_id, v_treatment1_price, 'USD', 'Cash', 'cash', 'Succeeded', v_treatment1_price + 5.00, v_cust5);

    -- 10f) Confirmed + already ended + already reviewed -- the "already reviewed" guard branch.
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate)
    VALUES (v_location_id, v_cust6, 'Confirmed', v_cust6, v_now - interval '15 days')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, SlotCount, Price, CreatedBy)
    VALUES (v_booking_id, v_treatment2, v_room2, v_therapist2, 1,
        v_now - interval '13 days', v_now - interval '13 days' + (v_treatment2_duration * 15 || ' minutes')::interval, v_treatment2_duration, v_treatment2_price, v_cust6);
    INSERT INTO public.Payments (BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, CreatedBy)
    VALUES (v_booking_id, v_treatment2_price, 'USD', 'InHouse', 'card', 'Succeeded', 'tx_seed_e2e_' || v_booking_id, v_cust6);
    INSERT INTO public.Reviews (BookingId, CustomerId, LocationId, Rating, Comment)
    VALUES (v_booking_id, v_cust6, v_location_id, 5, 'Great experience, will be back!');

    -- 10g) NoShow -- was Confirmed, start time already passed, never showed up.
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate)
    VALUES (v_location_id, v_cust1, 'NoShow', v_cust1, v_now - interval '4 days')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, SlotCount, Price, CreatedBy)
    VALUES (v_booking_id, v_treatment1, v_room1, v_therapist1, 1,
        v_now - interval '3 days', v_now - interval '3 days' + (v_treatment1_duration * 15 || ' minutes')::interval, v_treatment1_duration, v_treatment1_price, v_cust1);
    INSERT INTO public.Payments (BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, CreatedBy)
    VALUES (v_booking_id, v_treatment1_price, 'USD', 'Stripe', 'card', 'Succeeded', 'tx_seed_e2e_' || v_booking_id, v_cust1);

    -- 10h) Cancelled while still Draft (never confirmed) -- self-cancel, no CancelReasonId
    --      (matches sp_Booking_Cancel's own shape).
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate)
    VALUES (v_location_id, v_cust2, 'Cancelled', v_cust2, v_now - interval '6 days', v_cust2, v_now - interval '6 days' + interval '2 hours')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, SequenceOrder, SlotCount, Price, IsDelete, CreatedBy)
    VALUES (v_booking_id, v_treatment2, 1, v_treatment2_duration, v_treatment2_price, TRUE, v_cust2);

    -- 10i) Cancelled AFTER being Confirmed (admin cancel, with a CancelReasonId) -- exercises the
    --      stock-restock branch sp_Booking_CancelAsAdmin only takes for a prior-Confirmed booking.
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CancelReasonId, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate)
    VALUES (v_location_id, v_cust3, 'Cancelled', v_cancel_reason_id, v_manager_id, v_now - interval '9 days', v_manager_id, v_now - interval '1 day')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, SlotCount, Price, IsDelete, CreatedBy)
    VALUES (v_booking_id, v_treatment1, v_room2, v_therapist2, 1,
        v_now + interval '4 days', v_now + interval '4 days' + (v_treatment1_duration * 15 || ' minutes')::interval, v_treatment1_duration, v_treatment1_price, TRUE, v_manager_id);
    INSERT INTO public.Payments (BookingId, Amount, Currency, Provider, PaymentMethod, Status, TransactionId, CreatedBy)
    VALUES (v_booking_id, v_treatment1_price, 'USD', 'Stripe', 'card', 'Refunded', 'tx_seed_e2e_' || v_booking_id, v_manager_id);

    -- 10j) A Failed payment attempt left behind on an otherwise-still-open Draft (payment retry UX).
    INSERT INTO public.Bookings (LocationId, CustomerId, Status, CreatedBy, CreatedDate)
    VALUES (v_location_id, v_cust2, 'Draft', v_cust2, v_now - interval '1 minute')
    RETURNING Id INTO v_booking_id;
    INSERT INTO public.BookingTreatments (BookingId, TreatmentId, RoomId, TherapistId, SequenceOrder, StartTime, EndTime, ExpiresAt, SlotCount, Price, CreatedBy)
    VALUES (v_booking_id, v_treatment1, v_room1, v_therapist1, 1,
        (v_today + 3)::timestamp + interval '10 hours', (v_today + 3)::timestamp + interval '10 hours' + (v_treatment1_duration * 15 || ' minutes')::interval,
        v_now + interval '5 minutes', v_treatment1_duration, v_treatment1_price, v_cust2);
    INSERT INTO public.Payments (BookingId, Amount, Currency, Provider, PaymentMethod, Status, FailureReason, CreatedBy)
    VALUES (v_booking_id, v_treatment1_price, 'USD', 'Stripe', 'card', 'Failed', 'Your card was declined.', v_cust2);

    ------------------------------------------------------------------------------------------
    -- 11) Customer notes + tags -- one chain-scoped, one location-scoped each (the CK
    --     constraints require exactly one of ChainId/LocationId).
    ------------------------------------------------------------------------------------------
    INSERT INTO public.CustomerNotes (CustomerId, ChainId, Note, CreatedBy)
    VALUES (v_cust1, v_chain_id, 'Prefers appointments in the morning; allergic to sulfates.', v_manager_id);
    INSERT INTO public.CustomerNotes (CustomerId, LocationId, Note, CreatedBy)
    VALUES (v_cust4, v_location_id, 'Regular -- always books Therapist 1 when available.', v_manager_id);

    INSERT INTO public.CustomerTags (CustomerId, ChainId, Tag, CreatedBy)
    VALUES (v_cust1, v_chain_id, 'VIP', v_manager_id);
    INSERT INTO public.CustomerTags (CustomerId, LocationId, Tag, CreatedBy)
    VALUES (v_cust4, v_location_id, 'Regular', v_manager_id);

    ------------------------------------------------------------------------------------------
    -- 12) Backdate a few CustomerLocations binds so sp_Report_Retention has genuine "returning
    --     customer" rows rather than everything reading as brand new the moment this ran.
    ------------------------------------------------------------------------------------------
    UPDATE public.CustomerLocations
    SET CreatedDate = v_now - interval '120 days'
    WHERE CustomerId IN (v_cust1, v_cust4, v_cust5, v_cust6) AND IsDelete = FALSE;

END $$;

COMMIT;
