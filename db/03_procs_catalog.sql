CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetChains
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name FROM dbo.SaloonChains ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetLocations
    @ChainId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, ChainId, Name, Address, OpenTime, CloseTime, WorkingDaysMask, TimeZoneId
    FROM dbo.Locations
    WHERE ChainId = @ChainId AND IsActive = 1
    ORDER BY Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetLocationHolidays
    @LocationId INT,
    @FromDate   DATE,
    @ToDate     DATE
AS
BEGIN
    SET NOCOUNT ON;
    SELECT HolidayDate, Reason
    FROM dbo.LocationHolidays
    WHERE LocationId = @LocationId AND HolidayDate BETWEEN @FromDate AND @ToDate
    ORDER BY HolidayDate;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Catalog_GetTreatments
    @LocationId INT,
    @CategoryId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.Id, t.CategoryId, tc.Name AS CategoryName, t.Name,
           COALESCE(lt.PriceOverride, t.Price) AS Price, t.DurationSlots
    FROM dbo.Treatments t
    JOIN dbo.LocationTreatments lt ON lt.TreatmentId = t.Id AND lt.LocationId = @LocationId
    JOIN dbo.TreatmentCategories tc ON tc.Id = t.CategoryId
    WHERE t.IsActive = 1 AND lt.IsActive = 1
      AND (@CategoryId IS NULL OR t.CategoryId = @CategoryId)
    ORDER BY tc.Name, t.Name;
END
GO
