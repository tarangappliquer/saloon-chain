using System.Data;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Catalog.Infrastructure;

internal sealed record ChainDto(int Id, string Name);

internal sealed record LocationDto(
    int Id, int ChainId, string Name, string? Address,
    TimeSpan OpenTime, TimeSpan CloseTime, byte WorkingDaysMask, string TimeZoneId);

internal sealed record TreatmentDto(
    int Id, int CategoryId, string CategoryName, string Name, decimal Price, short DurationSlots);

internal sealed record LocationHolidayRow(DateTime HolidayDate, string? Reason);

internal sealed record TreatmentCategoryDto(int Id, int ChainId, string Name);

internal sealed record TherapistDto(int Id, string Name, bool IsActive);

internal sealed record RoomDto(int Id, int LocationId, string Name, bool IsActive);

internal sealed record AdminChainDto(int Id, string Name, bool IsActive);

internal sealed record AdminLocationDto(
    int Id, int ChainId, string Name, string? Address,
    TimeSpan OpenTime, TimeSpan CloseTime, byte WorkingDaysMask, string TimeZoneId, bool IsActive);

internal sealed record AdminTreatmentDto(
    int Id, int CategoryId, string CategoryName, string Name, decimal Price, short DurationSlots, bool IsActive);

internal sealed class CatalogRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
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

    public async Task<IEnumerable<AdminChainDto>> GetChainsForAdminAsync(int? chainId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<AdminChainDto>("dbo.sp_Admin_GetChains", new { ChainId = chainId });
    }

    public async Task<IEnumerable<AdminLocationDto>> GetLocationsForAdminAsync(int chainId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<AdminLocationDto>("dbo.sp_Admin_GetLocations", new { ChainId = chainId });
    }

    public async Task<IEnumerable<AdminTreatmentDto>> GetTreatmentsForAdminAsync(int chainId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<AdminTreatmentDto>("dbo.sp_Admin_GetTreatments", new { ChainId = chainId });
    }

    public async Task<int> CreateChainAsync(string name)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Name", name);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Catalog_CreateChain", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateChainAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Catalog_UpdateChain", new
        { Id = id, Name = name, IsActive = isActive, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<int> CreateLocationAsync(
        int chainId, string name, string? address, TimeSpan openTime, TimeSpan closeTime, byte workingDaysMask, string timeZoneId)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@ChainId", chainId);
        p.Add("@Name", name);
        p.Add("@Address", address);
        p.Add("@OpenTime", openTime);
        p.Add("@CloseTime", closeTime);
        p.Add("@WorkingDaysMask", workingDaysMask);
        p.Add("@TimeZoneId", timeZoneId);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Catalog_CreateLocation", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateLocationAsync(
        int id, string name, string? address, TimeSpan openTime, TimeSpan closeTime, byte workingDaysMask,
        string timeZoneId, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Catalog_UpdateLocation", new
        {
            Id = id,
            Name = name,
            Address = address,
            OpenTime = openTime,
            CloseTime = closeTime,
            WorkingDaysMask = workingDaysMask,
            TimeZoneId = timeZoneId,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task<IEnumerable<TreatmentCategoryDto>> GetTreatmentCategoriesAsync(int chainId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<TreatmentCategoryDto>("dbo.sp_Catalog_GetTreatmentCategories", new { ChainId = chainId });
    }

    public async Task<int> CreateTreatmentCategoryAsync(int chainId, string name)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@ChainId", chainId);
        p.Add("@Name", name);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Catalog_CreateTreatmentCategory", p);
        return p.Get<int>("@Id");
    }

    public async Task<int> CreateTreatmentAsync(int chainId, int categoryId, string name, decimal price, short durationSlots)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@ChainId", chainId);
        p.Add("@CategoryId", categoryId);
        p.Add("@Name", name);
        p.Add("@Price", price);
        p.Add("@DurationSlots", durationSlots);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Catalog_CreateTreatment", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateTreatmentAsync(int id, int categoryId, string name, decimal price, short durationSlots, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Catalog_UpdateTreatment", new
        {
            Id = id,
            CategoryId = categoryId,
            Name = name,
            Price = price,
            DurationSlots = durationSlots,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task AssignTreatmentToLocationAsync(int locationId, int treatmentId, decimal? priceOverride)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Catalog_AssignTreatmentToLocation", new
        {
            LocationId = locationId,
            TreatmentId = treatmentId,
            PriceOverride = priceOverride,
            CreatedBy = currentUser.RequireUserId()
        });
    }

    public async Task UnassignTreatmentFromLocationAsync(int locationId, int treatmentId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Catalog_UnassignTreatmentFromLocation", new
        { LocationId = locationId, TreatmentId = treatmentId, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<TherapistDto>> GetTherapistsAsync()
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<TherapistDto>("dbo.sp_Catalog_GetTherapists");
    }

    public async Task<int> CreateTherapistAsync(string name)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Name", name);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Catalog_CreateTherapist", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateTherapistAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Catalog_UpdateTherapist", new
        { Id = id, Name = name, IsActive = isActive, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<RoomDto>> GetRoomsAsync(int locationId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<RoomDto>("dbo.sp_Catalog_GetRooms", new { LocationId = locationId });
    }

    public async Task<int> CreateRoomAsync(int locationId, string name)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@Name", name);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Catalog_CreateRoom", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateRoomAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Catalog_UpdateRoom", new
        { Id = id, Name = name, IsActive = isActive, UpdatedBy = currentUser.RequireUserId() });
    }
}
