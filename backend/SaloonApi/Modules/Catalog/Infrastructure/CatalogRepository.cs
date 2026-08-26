using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using System.Data;

namespace SaloonApi.Modules.Catalog.Infrastructure;

internal sealed record ChainDto(int Id, string Name, TimeSpan? BreakStartTime, TimeSpan? BreakEndTime);

internal sealed record LocationDto(
    int Id, int ChainId, string Name, string? Address, decimal? Latitude, decimal? Longitude,
    TimeSpan OpenTime, TimeSpan CloseTime, TimeSpan? BreakStartTime, TimeSpan? BreakEndTime, byte WorkingDaysMask, string TimeZoneId);

internal sealed record VenueSearchResultDto(
    int Id, int ChainId, string ChainName, string Name, string? Address,
    TimeSpan OpenTime, TimeSpan CloseTime, byte WorkingDaysMask, string TimeZoneId,
    decimal? AverageRating = null, int? ReviewCount = null);

internal sealed record TreatmentDto(
    int Id, int CategoryId, string CategoryName, string Name, string? Description, decimal Price, short DurationSlots, short PreTimeMinutes);

internal sealed record LocationHolidayRow(DateTime HolidayDate, string? Reason);

internal sealed record LocationClosureDto(int Id, int LocationId, string LocationName, int ChainId, DateOnly HolidayDate, string? Reason, string Type);

// Dapper's constructor-based materialization doesn't handle DateOnly (see LocationHolidayRow above).
internal sealed record LocationClosureRow(int Id, int LocationId, string LocationName, int ChainId, DateTime HolidayDate, string? Reason, string Type);

internal sealed record LocationDayScheduleDto(int Id, byte DayBit, TimeSpan? OpenTime, TimeSpan? CloseTime, bool IsClosed, DateOnly EffectiveFrom, DateOnly? EffectiveTo);
internal sealed record LocationDayScheduleRow(int Id, byte DayBit, TimeSpan? OpenTime, TimeSpan? CloseTime, bool IsClosed, DateTime EffectiveFrom, DateTime? EffectiveTo);

internal sealed record TreatmentCategoryDto(int Id, int LocationId, string Name, bool IsActive);

internal sealed record TherapistDto(int Id, string Name, bool IsActive, int? ChainId, int? LocationId);

internal sealed record RoomDto(int Id, int LocationId, string Name, bool IsActive);

internal sealed record AdminChainDto(int Id, string Name, TimeSpan? BreakStartTime, TimeSpan? BreakEndTime, bool IsActive);

internal sealed record AdminLocationDto(
    int Id, int ChainId, string Name, string? Address, decimal? Latitude, decimal? Longitude,
    TimeSpan OpenTime, TimeSpan CloseTime, TimeSpan? BreakStartTime, TimeSpan? BreakEndTime, byte WorkingDaysMask, string TimeZoneId, bool IsActive);

// Price is nullable only for a treatment whose sole price row is future-dated (created with an
// EffectiveFrom later than today) -- not yet purchasable, but still visible to admins managing it.
internal sealed record AdminTreatmentDto(
    int Id, int CategoryId, string CategoryName, string Name, string? Description, decimal? Price, short DurationSlots, short PreTimeMinutes,
    DateOnly EffectiveFrom, bool IsActive);

// Dapper's constructor-based materialization doesn't handle DateOnly (see LocationHolidayRow above
// for the same workaround) -- query into this DateTime-typed row, then convert to the DateOnly DTO.
internal sealed record AdminTreatmentRow(
    int Id, int CategoryId, string CategoryName, string Name, string? Description, decimal? Price, short DurationSlots, short PreTimeMinutes,
    DateTime EffectiveFrom, bool IsActive);

internal sealed record TreatmentPriceDto(int Id, decimal Price, DateOnly EffectiveFrom, DateOnly? EffectiveTo);
internal sealed record TreatmentPriceRow(int Id, decimal Price, DateTime EffectiveFrom, DateTime? EffectiveTo);

internal sealed record TreatmentDurationDto(int Id, short DurationSlots, short PreTimeMinutes, DateOnly EffectiveFrom, DateOnly? EffectiveTo);
internal sealed record TreatmentDurationRow(int Id, short DurationSlots, short PreTimeMinutes, DateTime EffectiveFrom, DateTime? EffectiveTo);

internal sealed class CatalogRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<IEnumerable<ChainDto>> GetChainsAsync()
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<ChainDto>("public.sp_Catalog_GetChains");
    }

    public async Task<IEnumerable<LocationDto>> GetLocationsAsync(int chainId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<LocationDto>("public.sp_Catalog_GetLocations", new { ChainId = chainId });
    }

    public async Task<IEnumerable<TreatmentDto>> GetTreatmentsAsync(int locationId, int? categoryId = null)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<TreatmentDto>(
            "public.sp_Catalog_GetTreatments", new { LocationId = locationId, CategoryId = categoryId });
    }

    public async Task<IReadOnlyList<DateOnly>> GetHolidayDatesAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<LocationHolidayRow>("public.sp_Catalog_GetLocationHolidays", new
        {
            LocationId = locationId,
            FromDate = from.ToDateTime(TimeOnly.MinValue),
            ToDate = to.ToDateTime(TimeOnly.MinValue)
        });
        return rows.Select(r => DateOnly.FromDateTime(r.HolidayDate)).ToList();
    }

    public async Task<IEnumerable<AdminChainDto>> GetChainsForAdminAsync(int? chainId = null)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<AdminChainDto>("public.sp_Admin_GetChains", new { ChainId = chainId });
    }

    public async Task<IEnumerable<AdminLocationDto>> GetLocationsForAdminAsync(int chainId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<AdminLocationDto>("public.sp_Admin_GetLocations", new { ChainId = chainId });
    }

    public async Task<AdminLocationDto?> GetLocationByIdForAdminAsync(int locationId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<AdminLocationDto>(
            "public.sp_Admin_GetLocations", new { LocationId = locationId });
        return rows.FirstOrDefault();
    }

    public async Task<IEnumerable<AdminTreatmentDto>> GetTreatmentsForAdminAsync(int locationId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<AdminTreatmentRow>("public.sp_Admin_GetTreatments", new { LocationId = locationId });
        return rows.Select(r => new AdminTreatmentDto(
            r.Id, r.CategoryId, r.CategoryName, r.Name, r.Description, r.Price, r.DurationSlots, r.PreTimeMinutes, DateOnly.FromDateTime(r.EffectiveFrom), r.IsActive));
    }

    public async Task<int> CreateChainAsync(string name, TimeSpan? breakStartTime, TimeSpan? breakEndTime)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Name", name);
        p.Add("@BreakStartTime", breakStartTime);
        p.Add("@BreakEndTime", breakEndTime);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_CreateChain", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateChainAsync(int id, string name, TimeSpan? breakStartTime, TimeSpan? breakEndTime, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateChain", new
        {
            Id = id,
            Name = name,
            BreakStartTime = breakStartTime,
            BreakEndTime = breakEndTime,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task DeleteChainAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_DeleteChain", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<int> CreateLocationAsync(
        int chainId, string name, string? address, decimal? latitude, decimal? longitude, TimeSpan openTime, TimeSpan closeTime,
        TimeSpan? breakStartTime, TimeSpan? breakEndTime, byte workingDaysMask, string timeZoneId)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@ChainId", chainId);
        p.Add("@Name", name);
        p.Add("@Address", address);
        p.Add("@Latitude", latitude);
        p.Add("@Longitude", longitude);
        p.Add("@OpenTime", openTime);
        p.Add("@CloseTime", closeTime);
        p.Add("@BreakStartTime", breakStartTime);
        p.Add("@BreakEndTime", breakEndTime);
        p.Add("@WorkingDaysMask", workingDaysMask);
        p.Add("@TimeZoneId", timeZoneId);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_CreateLocation", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateLocationAsync(
        int id, string name, string? address, decimal? latitude, decimal? longitude, TimeSpan openTime, TimeSpan closeTime,
        TimeSpan? breakStartTime, TimeSpan? breakEndTime, byte workingDaysMask,
        string timeZoneId, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateLocation", new
        {
            Id = id,
            Name = name,
            Address = address,
            Latitude = latitude,
            Longitude = longitude,
            OpenTime = openTime,
            CloseTime = closeTime,
            BreakStartTime = breakStartTime,
            BreakEndTime = breakEndTime,
            WorkingDaysMask = workingDaysMask,
            TimeZoneId = timeZoneId,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task DeleteLocationAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_DeleteLocation", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<LocationDayScheduleDto>> GetLocationDayScheduleAsync(int locationId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<LocationDayScheduleRow>("public.sp_Catalog_GetLocationDaySchedule", new { LocationId = locationId });
        return rows.Select(r => new LocationDayScheduleDto(
            r.Id, r.DayBit, r.OpenTime, r.CloseTime, r.IsClosed, DateOnly.FromDateTime(r.EffectiveFrom),
            r.EffectiveTo.HasValue ? DateOnly.FromDateTime(r.EffectiveTo.Value) : null));
    }

    public async Task<int> AddLocationDayScheduleAsync(
        int locationId, byte dayBit, DateOnly effectiveFrom, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@DayBit", dayBit);
        p.Add("@OpenTime", openTime);
        p.Add("@CloseTime", closeTime);
        p.Add("@IsClosed", isClosed);
        p.Add("@EffectiveFrom", effectiveFrom);
        p.Add("@EffectiveTo", effectiveTo);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_AddLocationDaySchedule", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateLocationDayScheduleAsync(
        int id, DateOnly effectiveFrom, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Id", id);
        p.Add("@OpenTime", openTime);
        p.Add("@CloseTime", closeTime);
        p.Add("@IsClosed", isClosed);
        p.Add("@EffectiveFrom", effectiveFrom);
        p.Add("@EffectiveTo", effectiveTo);
        p.Add("@UpdatedBy", currentUser.RequireUserId());
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateLocationDaySchedule", p);
    }

    public async Task DeleteLocationDayScheduleAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_DeleteLocationDaySchedule", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<TreatmentCategoryDto>> GetTreatmentCategoriesAsync(int locationId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<TreatmentCategoryDto>("public.sp_Catalog_GetTreatmentCategories", new { LocationId = locationId });
    }

    public async Task<int> CreateTreatmentCategoryAsync(int locationId, string name)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@Name", name);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_CreateTreatmentCategory", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateTreatmentCategoryAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateTreatmentCategory", new
        { Id = id, Name = name, IsActive = isActive, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<int> CreateTreatmentAsync(
        int locationId, int categoryId, string name, string? description, short durationSlots, short preTimeMinutes, DateOnly effectiveFrom, decimal price)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@CategoryId", categoryId);
        p.Add("@Name", name);
        p.Add("@Description", description);
        p.Add("@DurationSlots", durationSlots);
        p.Add("@PreTimeMinutes", preTimeMinutes);
        p.Add("@EffectiveFrom", effectiveFrom);
        p.Add("@Price", price);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_CreateTreatment", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateTreatmentAsync(
        int id, int categoryId, string name, string? description, DateOnly effectiveFrom, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateTreatment", new
        {
            Id = id,
            CategoryId = categoryId,
            Name = name,
            Description = description,
            EffectiveFrom = effectiveFrom,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task<IEnumerable<TreatmentPriceDto>> GetTreatmentPricesAsync(int treatmentId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<TreatmentPriceRow>("public.sp_Catalog_GetTreatmentPrices", new { TreatmentId = treatmentId });
        return rows.Select(r => new TreatmentPriceDto(r.Id, r.Price, DateOnly.FromDateTime(r.EffectiveFrom), r.EffectiveTo.HasValue ? DateOnly.FromDateTime(r.EffectiveTo.Value) : null));
    }

    public async Task<int> AddTreatmentPriceAsync(int treatmentId, decimal price, DateOnly effectiveFrom, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@TreatmentId", treatmentId);
        p.Add("@Price", price);
        p.Add("@EffectiveFrom", effectiveFrom);
        p.Add("@EffectiveTo", effectiveTo);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_AddTreatmentPrice", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateTreatmentPriceAsync(int id, decimal price)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateTreatmentPrice", new
        { Id = id, Price = price, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<TreatmentDurationDto>> GetTreatmentDurationsAsync(int treatmentId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<TreatmentDurationRow>("public.sp_Catalog_GetTreatmentDurations", new { TreatmentId = treatmentId });
        return rows.Select(r => new TreatmentDurationDto(r.Id, r.DurationSlots, r.PreTimeMinutes, DateOnly.FromDateTime(r.EffectiveFrom), r.EffectiveTo.HasValue ? DateOnly.FromDateTime(r.EffectiveTo.Value) : null));
    }

    public async Task<int> AddTreatmentDurationAsync(int treatmentId, short durationSlots, short preTimeMinutes, DateOnly effectiveFrom, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@TreatmentId", treatmentId);
        p.Add("@DurationSlots", durationSlots);
        p.Add("@PreTimeMinutes", preTimeMinutes);
        p.Add("@EffectiveFrom", effectiveFrom);
        p.Add("@EffectiveTo", effectiveTo);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_AddTreatmentDuration", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateTreatmentDurationAsync(int id, short durationSlots, short preTimeMinutes)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateTreatmentDuration", new
        { Id = id, DurationSlots = durationSlots, PreTimeMinutes = preTimeMinutes, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task DeleteTreatmentDurationAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_DeleteTreatmentDuration", new
        { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<TherapistDto>> GetTherapistsAsync(int? chainId = null, int? locationId = null)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<TherapistDto>(
            "public.sp_Catalog_GetTherapists", new { ChainId = chainId, LocationId = locationId });
    }

    public async Task<int> CreateTherapistAsync(string name)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Name", name);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_CreateTherapist", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateTherapistAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateTherapist", new
        { Id = id, Name = name, IsActive = isActive, UpdatedBy = currentUser.RequireUserId() });
    }

    // Mirrors a TherapistProfile's ChainId/LocationId/UserId to the staff login that links to it --
    // called from AdminStaffEndpoints on staff create/update, never from the plain Therapists page.
    public async Task LinkTherapistScopeAsync(int id, int? chainId, int? locationId, int? userId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_LinkTherapistScope", new
        { Id = id, ChainId = chainId, LocationId = locationId, UserId = userId, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<RoomDto>> GetRoomsAsync(int locationId)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<RoomDto>("public.sp_Catalog_GetRooms", new { LocationId = locationId });
    }

    public async Task<int> CreateRoomAsync(int locationId, string name)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@Name", name);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Catalog_CreateRoom", p);
        return p.Get<int>("@Id");
    }

    public async Task UpdateRoomAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Catalog_UpdateRoom", new
        { Id = id, Name = name, IsActive = isActive, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<LocationClosureDto>> GetClosuresAsync(int? locationId, int? chainId, int? id = null)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<LocationClosureRow>(
            "public.sp_Admin_GetLocationClosures", new { LocationId = locationId, ChainId = chainId, Id = id });
        return rows.Select(r => new LocationClosureDto(r.Id, r.LocationId, r.LocationName, r.ChainId, DateOnly.FromDateTime(r.HolidayDate), r.Reason, r.Type));
    }

    public async Task CreateClosuresAsync(IEnumerable<int> locationIds, DateOnly fromDate, DateOnly toDate, string type, string? reason)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationIds", locationIds.AsIntIdList());
        p.Add("@FromDate", fromDate);
        p.Add("@ToDate", toDate);
        p.Add("@Type", type);
        p.Add("@Reason", reason);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        await db.ExecuteSpAsync("public.sp_Admin_CreateLocationClosures", p);
    }

    public async Task DeleteClosureAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Admin_DeleteLocationClosure", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IEnumerable<VenueSearchResultDto>> SearchVenuesAsync(string? search)
    {
        using var db = factory.Create();
        return await db.QuerySpAsync<VenueSearchResultDto>("public.sp_Catalog_Search", new { Search = search });
    }
}
