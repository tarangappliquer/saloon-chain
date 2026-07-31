using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Catalog.Infrastructure;

public sealed record ChainDto(int Id, string Name);

public sealed record LocationDto(
    int Id, int ChainId, string Name, string? Address,
    TimeSpan OpenTime, TimeSpan CloseTime, byte WorkingDaysMask, string TimeZoneId);

public sealed record TreatmentDto(
    int Id, int CategoryId, string CategoryName, string Name, decimal Price, short DurationSlots);

public sealed record LocationHolidayRow(DateTime HolidayDate, string? Reason);

public sealed class CatalogRepository(SqlConnectionFactory factory)
{
    public async Task<IEnumerable<ChainDto>> GetChainsAsync()
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<ChainDto>("dbo.sp_Catalog_GetChains");
    }

    public async Task<IEnumerable<LocationDto>> GetLocationsAsync(int chainId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<LocationDto>("dbo.sp_Catalog_GetLocations", new { ChainId = chainId });
    }

    public async Task<IEnumerable<TreatmentDto>> GetTreatmentsAsync(int locationId, int? categoryId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<TreatmentDto>(
            "dbo.sp_Catalog_GetTreatments", new { LocationId = locationId, CategoryId = categoryId });
    }

    public async Task<IReadOnlyList<DateOnly>> GetHolidayDatesAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<LocationHolidayRow>("dbo.sp_Catalog_GetLocationHolidays", new
        {
            LocationId = locationId,
            FromDate = from.ToDateTime(TimeOnly.MinValue),
            ToDate = to.ToDateTime(TimeOnly.MinValue)
        });
        return rows.Select(r => DateOnly.FromDateTime(r.HolidayDate)).ToList();
    }
}
