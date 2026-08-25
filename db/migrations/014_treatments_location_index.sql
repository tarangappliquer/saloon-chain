-- sp_Catalog_Search, sp_Catalog_GetTreatments, sp_Admin_GetTreatments, and the availability-cache
-- warm-up (BookingService.WarmAvailabilityAsync) all filter Treatments/TreatmentCategories by
-- LocationId on every call -- unlike TreatmentPrices/TreatmentDurations (indexed on TreatmentId),
-- neither table had any index covering LocationId, forcing a full table scan every time. ExplorePage
-- alone fires sp_Catalog_GetTreatments once per venue in the search results.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_TreatmentCategories_LocationId' AND object_id = OBJECT_ID('dbo.TreatmentCategories')
)
BEGIN
    CREATE INDEX IX_TreatmentCategories_LocationId ON dbo.TreatmentCategories(LocationId) WHERE IsDelete = 0;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Treatments_LocationId' AND object_id = OBJECT_ID('dbo.Treatments')
)
BEGIN
    CREATE INDEX IX_Treatments_LocationId ON dbo.Treatments(LocationId) WHERE IsDelete = 0;
END
GO
