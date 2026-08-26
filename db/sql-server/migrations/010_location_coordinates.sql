-- Migration 010: Add Coordinates (GEOGRAPHY) to dbo.Locations for the address map picker/display.
-- Nullable -- existing locations have no coordinates until an admin re-saves them via the map.
-- GEOGRAPHY (not plain Latitude/Longitude decimals) so a future "nearest location" query can use
-- STDistance() against the spatial index below instead of a Haversine calc in application code.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'Coordinates')
BEGIN
    ALTER TABLE dbo.Locations ADD Coordinates GEOGRAPHY NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'SIX_Locations_Coordinates' AND object_id = OBJECT_ID('dbo.Locations'))
BEGIN
    CREATE SPATIAL INDEX SIX_Locations_Coordinates ON dbo.Locations(Coordinates) USING GEOGRAPHY_AUTO_GRID;
END
GO
