using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Catalog.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class CatalogDbService
{
    public Task<IEnumerable<ChainDto>> sp_Catalog_GetChainsAsync(IDbConnection db)
    {
        return db.QueryAsync<ChainDto>("SELECT * FROM public.sp_Catalog_GetChains()", commandType: CommandType.Text);
    }

    public Task<IEnumerable<LocationDto>> sp_Catalog_GetLocationsAsync(IDbConnection db, int chainId)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        return db.QueryAsync<LocationDto>("SELECT * FROM public.sp_Catalog_GetLocations(@ChainId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<TreatmentDto>> sp_Catalog_GetTreatmentsAsync(IDbConnection db, int locationId, int? categoryId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("CategoryId", categoryId, DbType.Int32);
        return db.QueryAsync<TreatmentDto>("SELECT * FROM public.sp_Catalog_GetTreatments(@LocationId, @CategoryId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<LocationHolidayRow>> sp_Catalog_GetLocationHolidaysAsync(IDbConnection db, int locationId, DateOnly from, DateOnly to)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.QueryAsync<LocationHolidayRow>("SELECT * FROM public.sp_Catalog_GetLocationHolidays(@LocationId, @FromDate, @ToDate)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_CreateChainAsync(IDbConnection db, string name, TimeSpan? breakStartTime, TimeSpan? breakEndTime, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("Name", name, DbType.String);
        args.Add("BreakStartTime", breakStartTime, DbType.Time);
        args.Add("BreakEndTime", breakEndTime, DbType.Time);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Catalog_CreateChain(@Name, @BreakStartTime, @BreakEndTime, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateChainAsync(IDbConnection db, int id, string name, TimeSpan? breakStartTime, TimeSpan? breakEndTime, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("BreakStartTime", breakStartTime, DbType.Time);
        args.Add("BreakEndTime", breakEndTime, DbType.Time);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_UpdateChain(@Id, @Name, @BreakStartTime, @BreakEndTime, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_DeleteChainAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_DeleteChain(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_CreateLocationAsync(
        IDbConnection db, int chainId, string name, string? address, decimal? latitude, decimal? longitude, TimeSpan openTime, TimeSpan closeTime,
        TimeSpan? breakStartTime, TimeSpan? breakEndTime, byte workingDaysMask, string timeZoneId, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("Address", address, DbType.String);
        args.Add("Latitude", latitude, DbType.Decimal);
        args.Add("Longitude", longitude, DbType.Decimal);
        args.Add("OpenTime", openTime, DbType.Time);
        args.Add("CloseTime", closeTime, DbType.Time);
        args.Add("BreakStartTime", breakStartTime, DbType.Time);
        args.Add("BreakEndTime", breakEndTime, DbType.Time);
        args.Add("WorkingDaysMask", workingDaysMask, DbType.Byte);
        args.Add("TimeZoneId", timeZoneId, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Catalog_CreateLocation(@ChainId, @Name, @Address, @Latitude, @Longitude, @OpenTime, @CloseTime, @BreakStartTime, @BreakEndTime, @WorkingDaysMask, @TimeZoneId, @CreatedBy)",
            args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateLocationAsync(
        IDbConnection db, int id, string name, string? address, decimal? latitude, decimal? longitude, TimeSpan openTime, TimeSpan closeTime,
        TimeSpan? breakStartTime, TimeSpan? breakEndTime, byte workingDaysMask, string timeZoneId, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("Address", address, DbType.String);
        args.Add("Latitude", latitude, DbType.Decimal);
        args.Add("Longitude", longitude, DbType.Decimal);
        args.Add("OpenTime", openTime, DbType.Time);
        args.Add("CloseTime", closeTime, DbType.Time);
        args.Add("BreakStartTime", breakStartTime, DbType.Time);
        args.Add("BreakEndTime", breakEndTime, DbType.Time);
        args.Add("WorkingDaysMask", workingDaysMask, DbType.Byte);
        args.Add("TimeZoneId", timeZoneId, DbType.String);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync(
            "SELECT public.sp_Catalog_UpdateLocation(@Id, @Name, @Address, @Latitude, @Longitude, @OpenTime, @CloseTime, @BreakStartTime, @BreakEndTime, @WorkingDaysMask, @TimeZoneId, @IsActive, @UpdatedBy)",
            args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_DeleteLocationAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_DeleteLocation(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<LocationDayScheduleRow>> sp_Catalog_GetLocationDayScheduleAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<LocationDayScheduleRow>("SELECT * FROM public.sp_Catalog_GetLocationDaySchedule(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_AddLocationDayScheduleAsync(
        IDbConnection db, int locationId, byte dayBit, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, DateOnly effectiveFrom, DateOnly? effectiveTo, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("DayBit", dayBit, DbType.Byte);
        args.Add("OpenTime", openTime, DbType.Time);
        args.Add("CloseTime", closeTime, DbType.Time);
        args.Add("IsClosed", isClosed, DbType.Boolean);
        args.Add("EffectiveFrom", effectiveFrom, DbType.Date);
        args.Add("EffectiveTo", effectiveTo, DbType.Date);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        // Named-argument call (p_X => @X), not positional. The underlying SQL function declares
        // its params in a different order than this request's fields naturally fall in, so a
        // positional call here previously bound the wrong SQL parameter to each value entirely --
        // named args sidestep that regardless of which order the function declares them in.
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Catalog_AddLocationDaySchedule(p_LocationId => @LocationId, p_DayBit => @DayBit, p_OpenTime => @OpenTime, p_CloseTime => @CloseTime, p_IsClosed => @IsClosed, p_EffectiveFrom => @EffectiveFrom, p_EffectiveTo => @EffectiveTo, p_CreatedBy => @CreatedBy)",
            args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateLocationDayScheduleAsync(
        IDbConnection db, int id, TimeSpan? openTime, TimeSpan? closeTime, bool isClosed, DateOnly effectiveFrom, DateOnly? effectiveTo, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("OpenTime", openTime, DbType.Time);
        args.Add("CloseTime", closeTime, DbType.Time);
        args.Add("IsClosed", isClosed, DbType.Boolean);
        args.Add("EffectiveFrom", effectiveFrom, DbType.Date);
        args.Add("EffectiveTo", effectiveTo, DbType.Date);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        // Named-argument call -- the function's declared order is (Id, EffectiveFrom, UpdatedBy,
        // OpenTime, CloseTime, IsClosed, EffectiveTo), not this method's natural argument order.
        await db.ExecuteAsync(
            "SELECT public.sp_Catalog_UpdateLocationDaySchedule(p_Id => @Id, p_EffectiveFrom => @EffectiveFrom, p_UpdatedBy => @UpdatedBy, p_OpenTime => @OpenTime, p_CloseTime => @CloseTime, p_IsClosed => @IsClosed, p_EffectiveTo => @EffectiveTo)",
            args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_DeleteLocationDayScheduleAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_DeleteLocationDaySchedule(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<TreatmentCategoryDto>> sp_Catalog_GetTreatmentCategoriesAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<TreatmentCategoryDto>("SELECT * FROM public.sp_Catalog_GetTreatmentCategories(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_CreateTreatmentCategoryAsync(IDbConnection db, int locationId, string name, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Catalog_CreateTreatmentCategory(@LocationId, @Name, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateTreatmentCategoryAsync(IDbConnection db, int id, string name, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_UpdateTreatmentCategory(@Id, @Name, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_CreateTreatmentAsync(
        IDbConnection db, int locationId, int categoryId, string name, string? description, short durationSlots, short preTimeMinutes, DateOnly effectiveFrom, decimal price, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("CategoryId", categoryId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("Description", description, DbType.String);
        args.Add("DurationSlots", durationSlots, DbType.Int16);
        args.Add("PreTimeMinutes", preTimeMinutes, DbType.Int16);
        args.Add("EffectiveFrom", effectiveFrom, DbType.Date);
        args.Add("Price", price, DbType.Decimal);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Catalog_CreateTreatment(@LocationId, @CategoryId, @Name, @Description, @DurationSlots, @PreTimeMinutes, @EffectiveFrom, @Price, @CreatedBy)",
            args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateTreatmentAsync(
        IDbConnection db, int id, int categoryId, string name, string? description, DateOnly effectiveFrom, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("CategoryId", categoryId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("Description", description, DbType.String);
        args.Add("EffectiveFrom", effectiveFrom, DbType.Date);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync(
            "SELECT public.sp_Catalog_UpdateTreatment(@Id, @CategoryId, @Name, @Description, @EffectiveFrom, @IsActive, @UpdatedBy)",
            args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<TreatmentPriceRow>> sp_Catalog_GetTreatmentPricesAsync(IDbConnection db, int treatmentId)
    {
        var args = new DynamicParameters();
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        return db.QueryAsync<TreatmentPriceRow>("SELECT * FROM public.sp_Catalog_GetTreatmentPrices(@TreatmentId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_AddTreatmentPriceAsync(IDbConnection db, int treatmentId, decimal price, DateOnly effectiveFrom, DateOnly? effectiveTo, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        args.Add("Price", price, DbType.Decimal);
        args.Add("EffectiveFrom", effectiveFrom, DbType.Date);
        args.Add("EffectiveTo", effectiveTo, DbType.Date);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        // Named-argument call -- the function's declared order is (TreatmentId, Price,
        // EffectiveFrom, CreatedBy, EffectiveTo), not the request's natural field order.
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Catalog_AddTreatmentPrice(p_TreatmentId => @TreatmentId, p_Price => @Price, p_EffectiveFrom => @EffectiveFrom, p_EffectiveTo => @EffectiveTo, p_CreatedBy => @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateTreatmentPriceAsync(IDbConnection db, int id, decimal price, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Price", price, DbType.Decimal);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_UpdateTreatmentPrice(@Id, @Price, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<TreatmentDurationRow>> sp_Catalog_GetTreatmentDurationsAsync(IDbConnection db, int treatmentId)
    {
        var args = new DynamicParameters();
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        return db.QueryAsync<TreatmentDurationRow>("SELECT * FROM public.sp_Catalog_GetTreatmentDurations(@TreatmentId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_AddTreatmentDurationAsync(IDbConnection db, int treatmentId, short durationSlots, short preTimeMinutes, DateOnly effectiveFrom, DateOnly? effectiveTo, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        args.Add("DurationSlots", durationSlots, DbType.Int16);
        args.Add("PreTimeMinutes", preTimeMinutes, DbType.Int16);
        args.Add("EffectiveFrom", effectiveFrom, DbType.Date);
        args.Add("EffectiveTo", effectiveTo, DbType.Date);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        // Named-argument call -- the function's declared order is (TreatmentId, DurationSlots,
        // EffectiveFrom, CreatedBy, PreTimeMinutes, EffectiveTo), not the request's natural field order.
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Catalog_AddTreatmentDuration(p_TreatmentId => @TreatmentId, p_DurationSlots => @DurationSlots, p_PreTimeMinutes => @PreTimeMinutes, p_EffectiveFrom => @EffectiveFrom, p_EffectiveTo => @EffectiveTo, p_CreatedBy => @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateTreatmentDurationAsync(IDbConnection db, int id, short durationSlots, short preTimeMinutes, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("DurationSlots", durationSlots, DbType.Int16);
        args.Add("PreTimeMinutes", preTimeMinutes, DbType.Int16);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_UpdateTreatmentDuration(@Id, @DurationSlots, @PreTimeMinutes, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_DeleteTreatmentDurationAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_DeleteTreatmentDuration(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<TherapistDto>> sp_Catalog_GetTherapistsAsync(IDbConnection db, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<TherapistDto>("SELECT * FROM public.sp_Catalog_GetTherapists(@ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_CreateTherapistAsync(IDbConnection db, string name, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("Name", name, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Catalog_CreateTherapist(@Name, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateTherapistAsync(IDbConnection db, int id, string name, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_UpdateTherapist(@Id, @Name, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_LinkTherapistScopeAsync(IDbConnection db, int id, int? chainId, int? locationId, int? userId, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("UserId", userId, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_LinkTherapistScope(@Id, @ChainId, @LocationId, @UserId, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<RoomDto>> sp_Catalog_GetRoomsAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<RoomDto>("SELECT * FROM public.sp_Catalog_GetRooms(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Catalog_CreateRoomAsync(IDbConnection db, int locationId, string name, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Catalog_CreateRoom(@LocationId, @Name, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Catalog_UpdateRoomAsync(IDbConnection db, int id, string name, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Catalog_UpdateRoom(@Id, @Name, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<VenueSearchResultDto>> sp_Catalog_SearchAsync(IDbConnection db, string? search)
    {
        var args = new DynamicParameters();
        args.Add("Search", search, DbType.String);
        return db.QueryAsync<VenueSearchResultDto>("SELECT * FROM public.sp_Catalog_Search(@Search)", args, commandType: CommandType.Text);
    }
}
