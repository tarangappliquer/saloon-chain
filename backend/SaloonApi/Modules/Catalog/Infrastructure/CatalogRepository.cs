using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

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

internal sealed record LocationHolidayRow(int Id, int LocationId, DateTime HolidayDate, string? Reason);

internal sealed record LocationClosureDto(int Id, int LocationId, string LocationName, int ChainId, DateOnly HolidayDate, string? Reason, string Type);

internal sealed record LocationClosureRow(int Id, int LocationId, string LocationName, int ChainId, DateTime HolidayDate, string? Reason, string Type);

internal sealed record LocationDayScheduleDto(int Id, byte DayBit, TimeSpan? OpenTime, TimeSpan? CloseTime, bool IsClosed, DateOnly EffectiveFrom, DateOnly? EffectiveTo);
internal sealed record LocationDayScheduleRow(int Id, byte DayBit, TimeSpan? OpenTime, TimeSpan? CloseTime, bool IsClosed, DateTime EffectiveFrom, DateTime? EffectiveTo);

internal sealed record TreatmentCategoryDto(int Id, string Name);

internal sealed record TherapistDto(int Id, string Name, bool IsActive, int? ChainId, int? LocationId);

internal sealed record RoomDto(int Id, int LocationId, string Name, bool IsActive);

internal sealed record AdminChainDto(int Id, string Name, bool IsActive);
internal sealed record AdminLocationDto(int Id, int ChainId, string Name, string? Address, string TimeZoneId, bool IsActive);
internal sealed record AdminTreatmentRow(int Id, int CategoryId, string CategoryName, string Name, string? Description, decimal Price, short DurationSlots, short PreTimeMinutes, DateTime EffectiveFrom, bool IsActive);
internal sealed record AdminTreatmentDto(int Id, int CategoryId, string CategoryName, string Name, string? Description, decimal Price, short DurationSlots, short PreTimeMinutes, DateOnly EffectiveFrom, bool IsActive);

internal sealed record TreatmentPriceDto(int Id, decimal Price, DateOnly EffectiveFrom, DateOnly? EffectiveTo);
internal sealed record TreatmentPriceRow(int Id, decimal Price, DateTime EffectiveFrom, DateTime? EffectiveTo);

internal sealed record TreatmentDurationDto(int Id, short DurationSlots, short PreTimeMinutes, DateOnly EffectiveFrom, DateOnly? EffectiveTo);
internal sealed record TreatmentDurationRow(int Id, short DurationSlots, short PreTimeMinutes, DateTime EffectiveFrom, DateTime? EffectiveTo);

internal sealed class CatalogRepository(SqlConnectionFactory factory, ICurrentUser currentUser, CatalogDbService catalogDb, AdminDbService adminDb)
{
    public async Task<IEnumerable<ChainDto>> GetChainsAsync()
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_GetChainsAsync(db);
    }

    public async Task<IEnumerable<LocationDto>> GetLocationsAsync(int chainId)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_GetLocationsAsync(db, chainId);
    }

    public async Task<IEnumerable<TreatmentDto>> GetTreatmentsAsync(int locationId, int? categoryId = null)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_GetTreatmentsAsync(db, locationId, categoryId);
    }

    public async Task<IReadOnlyList<DateOnly>> GetHolidayDatesAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        var rows = await catalogDb.sp_Catalog_GetLocationHolidaysAsync(db, locationId, from, to);
        return rows.Select(r => DateOnly.FromDateTime(r.HolidayDate)).ToList();
    }

    public async Task<IEnumerable<AdminChainDto>> GetChainsForAdminAsync(int? chainId = null)
    {
        using var db = factory.Create();
        return await adminDb.sp_Admin_GetChainsAsync(db, chainId);
    }

    public async Task<IEnumerable<AdminLocationDto>> GetLocationsForAdminAsync(int chainId)
    {
        using var db = factory.Create();
        return await adminDb.sp_Admin_GetLocationsAsync(db, chainId, null);
    }

    public async Task<AdminLocationDto?> GetLocationByIdForAdminAsync(int locationId)
    {
        using var db = factory.Create();
        var rows = await adminDb.sp_Admin_GetLocationsAsync(db, null, locationId);
        return rows.FirstOrDefault();
    }

    public async Task<IEnumerable<AdminTreatmentDto>> GetTreatmentsForAdminAsync(int locationId)
    {
        using var db = factory.Create();
        var rows = await adminDb.sp_Admin_GetTreatmentsAsync(db, locationId);
        return rows.Select(r => new AdminTreatmentDto(
            r.Id, r.CategoryId, r.CategoryName, r.Name, r.Description, r.Price, r.DurationSlots, r.PreTimeMinutes, DateOnly.FromDateTime(r.EffectiveFrom), r.IsActive));
    }

    public async Task<int> CreateChainAsync(string name, TimeSpan? breakStartTime, TimeSpan? breakEndTime)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_CreateChainAsync(db, name, breakStartTime, breakEndTime, currentUser.RequireUserId());
    }

    public async Task UpdateChainAsync(int id, string name, TimeSpan? breakStartTime, TimeSpan? breakEndTime, bool isActive)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateChainAsync(db, id, name, breakStartTime, breakEndTime, isActive, currentUser.RequireUserId());
    }

    public async Task DeleteChainAsync(int id)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_DeleteChainAsync(db, id, currentUser.RequireUserId());
    }

    public async Task<int> CreateLocationAsync(
        int chainId, string name, string? address, decimal? latitude, decimal? longitude, TimeSpan openTime, TimeSpan closeTime,
        TimeSpan? breakStartTime, TimeSpan? breakEndTime, byte workingDaysMask, string timeZoneId)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_CreateLocationAsync(
            db, chainId, name, address, latitude, longitude, openTime, closeTime, breakStartTime, breakEndTime, workingDaysMask, timeZoneId, currentUser.RequireUserId());
    }

    public async Task UpdateLocationAsync(
        int id, string name, string? address, decimal? latitude, decimal? longitude, TimeSpan openTime, TimeSpan closeTime,
        TimeSpan? breakStartTime, TimeSpan? breakEndTime, byte workingDaysMask,
        string timeZoneId, bool isActive)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateLocationAsync(
            db, id, name, address, latitude, longitude, openTime, closeTime, breakStartTime, breakEndTime, workingDaysMask, timeZoneId, isActive, currentUser.RequireUserId());
    }

    public async Task DeleteLocationAsync(int id)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_DeleteLocationAsync(db, id, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<LocationDayScheduleDto>> GetLocationDayScheduleAsync(int locationId)
    {
        using var db = factory.Create();
        var rows = await catalogDb.sp_Catalog_GetLocationDayScheduleAsync(db, locationId);
        return rows.Select(r => new LocationDayScheduleDto(
            r.Id, r.DayBit, r.OpenTime, r.CloseTime, r.IsClosed, DateOnly.FromDateTime(r.EffectiveFrom),
            r.EffectiveTo.HasValue ? DateOnly.FromDateTime(r.EffectiveTo.Value) : null));
    }

    public async Task<int> AddLocationDayScheduleAsync(
        int locationId, byte dayBit, DateOnly effectiveFrom, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_AddLocationDayScheduleAsync(
            db, locationId, dayBit, openTime, closeTime, isClosed, effectiveFrom, effectiveTo, currentUser.RequireUserId());
    }

    public async Task UpdateLocationDayScheduleAsync(
        int id, DateOnly effectiveFrom, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateLocationDayScheduleAsync(
            db, id, openTime, closeTime, isClosed, effectiveFrom, effectiveTo, currentUser.RequireUserId());
    }

    public async Task DeleteLocationDayScheduleAsync(int id)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_DeleteLocationDayScheduleAsync(db, id, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<TreatmentCategoryDto>> GetTreatmentCategoriesAsync(int locationId)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_GetTreatmentCategoriesAsync(db, locationId);
    }

    public async Task<int> CreateTreatmentCategoryAsync(int locationId, string name)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_CreateTreatmentCategoryAsync(db, locationId, name, currentUser.RequireUserId());
    }

    public async Task UpdateTreatmentCategoryAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateTreatmentCategoryAsync(db, id, name, isActive, currentUser.RequireUserId());
    }

    public async Task<int> CreateTreatmentAsync(
        int locationId, int categoryId, string name, string? description, short durationSlots, short preTimeMinutes, DateOnly effectiveFrom, decimal price)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_CreateTreatmentAsync(
            db, locationId, categoryId, name, description, durationSlots, preTimeMinutes, effectiveFrom, price, currentUser.RequireUserId());
    }

    public async Task UpdateTreatmentAsync(
        int id, int categoryId, string name, string? description, DateOnly effectiveFrom, bool isActive)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateTreatmentAsync(
            db, id, categoryId, name, description, effectiveFrom, isActive, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<TreatmentPriceDto>> GetTreatmentPricesAsync(int treatmentId)
    {
        using var db = factory.Create();
        var rows = await catalogDb.sp_Catalog_GetTreatmentPricesAsync(db, treatmentId);
        return rows.Select(r => new TreatmentPriceDto(r.Id, r.Price, DateOnly.FromDateTime(r.EffectiveFrom), r.EffectiveTo.HasValue ? DateOnly.FromDateTime(r.EffectiveTo.Value) : null));
    }

    public async Task<int> AddTreatmentPriceAsync(int treatmentId, decimal price, DateOnly effectiveFrom, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_AddTreatmentPriceAsync(db, treatmentId, price, effectiveFrom, effectiveTo, currentUser.RequireUserId());
    }

    public async Task UpdateTreatmentPriceAsync(int id, decimal price)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateTreatmentPriceAsync(db, id, price, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<TreatmentDurationDto>> GetTreatmentDurationsAsync(int treatmentId)
    {
        using var db = factory.Create();
        var rows = await catalogDb.sp_Catalog_GetTreatmentDurationsAsync(db, treatmentId);
        return rows.Select(r => new TreatmentDurationDto(r.Id, r.DurationSlots, r.PreTimeMinutes, DateOnly.FromDateTime(r.EffectiveFrom), r.EffectiveTo.HasValue ? DateOnly.FromDateTime(r.EffectiveTo.Value) : null));
    }

    public async Task<int> AddTreatmentDurationAsync(int treatmentId, short durationSlots, short preTimeMinutes, DateOnly effectiveFrom, DateOnly? effectiveTo)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_AddTreatmentDurationAsync(db, treatmentId, durationSlots, preTimeMinutes, effectiveFrom, effectiveTo, currentUser.RequireUserId());
    }

    public async Task UpdateTreatmentDurationAsync(int id, short durationSlots, short preTimeMinutes)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateTreatmentDurationAsync(db, id, durationSlots, preTimeMinutes, currentUser.RequireUserId());
    }

    public async Task DeleteTreatmentDurationAsync(int id)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_DeleteTreatmentDurationAsync(db, id, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<TherapistDto>> GetTherapistsAsync(int? chainId = null, int? locationId = null)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_GetTherapistsAsync(db, chainId, locationId);
    }

    public async Task<int> CreateTherapistAsync(string name)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_CreateTherapistAsync(db, name, currentUser.RequireUserId());
    }

    public async Task UpdateTherapistAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateTherapistAsync(db, id, name, isActive, currentUser.RequireUserId());
    }

    public async Task LinkTherapistScopeAsync(int id, int? chainId, int? locationId, int? userId)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_LinkTherapistScopeAsync(db, id, chainId, locationId, userId, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<RoomDto>> GetRoomsAsync(int locationId)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_GetRoomsAsync(db, locationId);
    }

    public async Task<int> CreateRoomAsync(int locationId, string name)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_CreateRoomAsync(db, locationId, name, currentUser.RequireUserId());
    }

    public async Task UpdateRoomAsync(int id, string name, bool isActive)
    {
        using var db = factory.Create();
        await catalogDb.sp_Catalog_UpdateRoomAsync(db, id, name, isActive, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<LocationClosureDto>> GetClosuresAsync(int? locationId, int? chainId, int? id = null)
    {
        using var db = factory.Create();
        var rows = await adminDb.sp_Admin_GetLocationClosuresAsync(db, locationId, chainId, id);
        return rows.Select(r => new LocationClosureDto(r.Id, r.LocationId, r.LocationName, r.ChainId, DateOnly.FromDateTime(r.HolidayDate), r.Reason, r.Type));
    }

    public async Task CreateClosuresAsync(IEnumerable<int> locationIds, DateOnly fromDate, DateOnly toDate, string type, string? reason)
    {
        using var db = factory.Create();
        await adminDb.sp_Admin_CreateLocationClosuresAsync(db, locationIds.ToArray(), fromDate, toDate, type, reason, currentUser.RequireUserId());
    }

    public async Task DeleteClosureAsync(int id)
    {
        using var db = factory.Create();
        await adminDb.sp_Admin_DeleteLocationClosureAsync(db, id, currentUser.RequireUserId());
    }

    public async Task<IEnumerable<VenueSearchResultDto>> SearchVenuesAsync(string? search)
    {
        using var db = factory.Create();
        return await catalogDb.sp_Catalog_SearchAsync(db, search);
    }
}
