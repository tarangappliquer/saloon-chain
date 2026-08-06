-- Migration 004: Effective-dated treatment pricing + treatment go-live date.
-- Replaces dbo.Treatments.Price (single current price) with dbo.TreatmentPrices, a history of
-- (Price, EffectiveFrom) rows -- a treatment's price as of any date is the row with the latest
-- EffectiveFrom <= that date. Also adds dbo.Treatments.EffectiveFrom, which gates client-portal
-- visibility/bookability independently of price -- a treatment can be created and priced ahead of
-- when it should actually go live. Idempotent -- safe to re-run. Run this against an existing
-- database instead of re-running 01_tables.sql. After this, re-run 03_procs.sql to pick up the
-- updated sp_Catalog_GetTreatments/sp_Admin_GetTreatments/sp_Catalog_CreateTreatment/
-- sp_Catalog_UpdateTreatment/sp_Booking_CreateDraft/sp_Booking_AddTreatment/
-- sp_Booking_GetAvailabilityData and the new sp_Catalog_AddTreatmentPrice/sp_Catalog_GetTreatmentPrices.

-- 1. Create the new table.
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'TreatmentPrices' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.TreatmentPrices (
        Id             INT IDENTITY(1,1) PRIMARY KEY,
        TreatmentId    INT NOT NULL REFERENCES dbo.Treatments(Id),
        Price          DECIMAL(10,2) NOT NULL,
        EffectiveFrom  DATE NOT NULL,
        IsDelete       BIT NOT NULL DEFAULT 0,
        CreatedBy      INT NULL,
        CreatedDate    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy      INT NULL,
        UpdatedDate    DATETIME2 NULL
    );
    CREATE INDEX IX_TreatmentPrices_TreatmentId_EffectiveFrom ON dbo.TreatmentPrices(TreatmentId, EffectiveFrom DESC);
END
GO

-- 2. One price per treatment per effective date -- filtered so a soft-deleted (corrected) entry
-- never blocks re-scheduling the same date.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'UQ_TreatmentPrices_Treatment_EffectiveFrom' AND object_id = OBJECT_ID('dbo.TreatmentPrices')
)
BEGIN
    CREATE UNIQUE INDEX UQ_TreatmentPrices_Treatment_EffectiveFrom ON dbo.TreatmentPrices(TreatmentId, EffectiveFrom) WHERE IsDelete = 0;
END
GO

-- 3. Backfill one price row per existing treatment, effective from the date it was created.
-- Wrapped in dynamic SQL -- a plain SELECT t.Price would fail to *compile* once Price no longer
-- exists on dbo.Treatments (SQL Server binds columns for a table that exists at parse time, even
-- inside a branch this IF guard will skip at runtime), so this must defer compilation until the
-- guard has already confirmed the column is there.
IF EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Treatments') AND name = 'Price'
)
BEGIN
    EXEC('
        INSERT INTO dbo.TreatmentPrices (TreatmentId, Price, EffectiveFrom, CreatedBy)
        SELECT t.Id, t.Price, CAST(t.CreatedDate AS DATE), t.CreatedBy
        FROM dbo.Treatments t
        WHERE NOT EXISTS (SELECT 1 FROM dbo.TreatmentPrices tp WHERE tp.TreatmentId = t.Id)
    ');
END
GO

-- 4. Drop the now-redundant column.
IF EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Treatments') AND name = 'Price'
)
BEGIN
    ALTER TABLE dbo.Treatments DROP COLUMN Price;
END
GO

-- 5. Add Treatments.EffectiveFrom -- existing treatments go live immediately (their creation date).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Treatments') AND name = 'EffectiveFrom'
)
BEGIN
    ALTER TABLE dbo.Treatments ADD EffectiveFrom DATE NOT NULL CONSTRAINT DF_Treatments_EffectiveFrom DEFAULT CAST(SYSUTCDATETIME() AS DATE);
    EXEC('UPDATE dbo.Treatments SET EffectiveFrom = CAST(CreatedDate AS DATE)');
END
GO

-- 6. Add TreatmentPrices.UpdatedBy/UpdatedDate -- a price can now be corrected in place
-- (sp_Catalog_UpdateTreatmentPrice) while no booking has relied on it yet.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.TreatmentPrices') AND name = 'UpdatedBy'
)
BEGIN
    ALTER TABLE dbo.TreatmentPrices ADD UpdatedBy INT NULL, UpdatedDate DATETIME2 NULL;
END
GO

-- 7. Add BookingTreatments.TreatmentPriceId -- which TreatmentPrices row Price was captured from,
-- so sp_Catalog_UpdateTreatmentPrice can check "has any booking used this exact price row" by FK
-- instead of inferring it from dates. NULL on existing rows (created before this column existed).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BookingTreatments') AND name = 'TreatmentPriceId'
)
BEGIN
    ALTER TABLE dbo.BookingTreatments ADD TreatmentPriceId INT NULL REFERENCES dbo.TreatmentPrices(Id);
END
GO
