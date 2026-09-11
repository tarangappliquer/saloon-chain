using Dapper;
using SaloonApi.Modules.Booking.Infrastructure;
using System.Data;
using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Data.DbServices;

internal sealed record ScheduleTreatmentRow
{
    public DateTime ExpiresAt { get; init; }
    public int LocationId { get; init; }
}

// Wrapper for sp_Booking_GetLocationOpenDates' single `date` column. Dapper cannot materialize a
// bare column into a scalar `DateOnly` via QueryAsync<DateOnly> -- even with DateOnlyTypeHandler
// registered it silently yields DateOnly.MinValue for every row -- but it maps the column onto a
// DateOnly *property* correctly (same path every other WorkDate column uses).
internal sealed record OpenDateRow
{
    public DateOnly WorkDate { get; init; }
}

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class BookingDbService
{
    // Booking slot times are naive venue wall-clock (SlotCalculator emits DateTimeKind.Unspecified
    // and the read path relabels them Utc). The columns are TIMESTAMPTZ, and Npgsql refuses a
    // non-Utc DateTime for that -- so pin the Kind here. Unspecified is relabelled (digits kept),
    // Local is converted.
    //private static DateTime AsUtc(DateTime dt) => dt.Kind switch
    //{
    //    DateTimeKind.Utc => dt,
    //    DateTimeKind.Local => dt.ToUniversalTime(),
    //    _ => DateTime.SpecifyKind(dt, DateTimeKind.Utc),
    //};

    // Each result set is now its own single-purpose fn_Booking_Availability* function (see
    // db/postgres/03_procs_postgres.sql) instead of a hand-rolled refcursor procedure -- Dapper's
    // own QueryMultipleAsync already gives one round trip + ordered ReadAsync<T>() calls for free,
    // so no custom RefCursorGridReader plumbing is needed here.
    public Task<SqlMapper.GridReader> sp_Booking_GetAvailabilityDataAsync(
        IDbConnection db, int locationId, int[] treatmentIds, DateOnly date, int? excludeBookingId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("TreatmentIds", treatmentIds);
        args.Add("WorkDate", date.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("ExcludeBookingId", excludeBookingId, DbType.Int32);
        const string sql = """
            SELECT * FROM public.fn_Booking_AvailabilityLocationHours(@LocationId, @WorkDate);
            SELECT * FROM public.fn_Booking_AvailabilityTreatments(@LocationId, @TreatmentIds);
            SELECT * FROM public.fn_Booking_AvailabilityEligiblePairs(@LocationId, @TreatmentIds, @WorkDate);
            SELECT * FROM public.fn_Booking_AvailabilityScheduledLines(@WorkDate, @ExcludeBookingId);
            SELECT * FROM public.fn_Booking_AvailabilityBlockedSlots(@LocationId, @WorkDate);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public Task<SqlMapper.GridReader> sp_Booking_GetAvailabilityDataRangeAsync(
        IDbConnection db, int locationId, int[] treatmentIds, DateOnly from, DateOnly to, int? excludeBookingId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("TreatmentIds", treatmentIds);
        args.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("ExcludeBookingId", excludeBookingId, DbType.Int32);
        const string sql = """
            SELECT * FROM public.fn_Booking_AvailabilityRangeLocation(@LocationId);
            SELECT * FROM public.fn_Booking_AvailabilityRangeDayHours(@LocationId, @FromDate, @ToDate);
            SELECT * FROM public.fn_Booking_AvailabilityTreatments(@LocationId, @TreatmentIds);
            SELECT * FROM public.fn_Booking_AvailabilityRangeEligiblePairs(@LocationId, @TreatmentIds, @FromDate, @ToDate);
            SELECT * FROM public.fn_Booking_AvailabilityRangeScheduledLines(@FromDate, @ToDate, @ExcludeBookingId);
            SELECT * FROM public.fn_Booking_AvailabilityRangeBlockedSlots(@LocationId, @FromDate, @ToDate);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public Task<bool> sp_Booking_HasLocationRoomOpeningsAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_Booking_HasLocationRoomOpenings(@LocationId)", args, commandType: CommandType.Text);
    }

    public async Task<IEnumerable<DateOnly>> sp_Booking_GetLocationOpenDatesAsync(IDbConnection db, int locationId, DateOnly from, DateOnly to)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        var rows = await db.QueryAsync<OpenDateRow>(
            "SELECT * FROM public.sp_Booking_GetLocationOpenDates(@LocationId, @FromDate, @ToDate)", args, commandType: CommandType.Text);
        return rows.Select(r => r.WorkDate).ToList();
    }

    public Task<int> sp_Booking_CreateDraftAsync(IDbConnection db, int locationId, int customerId, int[] treatments, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("Treatments", treatments, DbType.Object);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Booking_CreateDraft(@LocationId, @CustomerId, @Treatments, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Booking_AddTreatmentAsync(IDbConnection db, int bookingId, int customerId, int treatmentId, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Booking_AddTreatment(@BookingId, @CustomerId, @TreatmentId, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public Task<BookingLocationRow?> sp_Booking_RemoveTreatmentAsync(IDbConnection db, int bookingId, int customerId, int treatmentId, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<BookingLocationRow>("SELECT * FROM public.sp_Booking_RemoveTreatment(@BookingId, @CustomerId, @TreatmentId, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<ScheduleTreatmentRow?> sp_Booking_ScheduleTreatmentAsync(
        IDbConnection db, int bookingId, int customerId, int treatmentId, int roomId, int therapistId, DateTime startTime, DateTime endTime, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("TherapistId", therapistId, DbType.Int32);
        args.Add("StartTime", startTime, DbType.DateTime);
        args.Add("EndTime", endTime, DbType.DateTime);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<ScheduleTreatmentRow>(
            "SELECT * FROM public.sp_Booking_ScheduleTreatment(@BookingId, @CustomerId, @TreatmentId, @RoomId, @TherapistId, @StartTime, @EndTime, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Booking_RescheduleConfirmedAsync(
        IDbConnection db, int bookingId, int treatmentId, int roomId, int therapistId, DateTime startTime, DateTime endTime, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("TherapistId", therapistId, DbType.Int32);
        args.Add("StartTime", startTime, DbType.DateTime);
        args.Add("EndTime", endTime, DbType.DateTime);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Booking_RescheduleConfirmed(@BookingId, @TreatmentId, @RoomId, @TherapistId, @StartTime, @EndTime, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Booking_ReassignTherapistAsync(
        IDbConnection db, int bookingId, int treatmentId, int newTherapistId, string? reason, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("TreatmentId", treatmentId, DbType.Int32);
        args.Add("NewTherapistId", newTherapistId, DbType.Int32);
        args.Add("Reason", reason, DbType.String);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Booking_ReassignTherapist(@BookingId, @TreatmentId, @NewTherapistId, @Reason, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<SqlMapper.GridReader> sp_Booking_GetByIdAsync(IDbConnection db, int bookingId, int customerId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        const string sql = """
            SELECT * FROM public.fn_Booking_GetByIdHeader(@BookingId, @CustomerId);
            SELECT * FROM public.fn_Booking_GetByIdTreatments(@BookingId);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public Task<int?> sp_Booking_GetCustomerIdAsync(IDbConnection db, int bookingId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        return db.ExecuteScalarAsync<int?>("SELECT * FROM public.sp_Booking_GetCustomerId(@BookingId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<BookingLocationRow>> sp_Booking_ConfirmAsync(IDbConnection db, int bookingId, int customerId, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        return db.QueryAsync<BookingLocationRow>("SELECT * FROM public.sp_Booking_Confirm(@BookingId, @CustomerId, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<SqlMapper.GridReader> sp_Booking_GetConfirmationDetailsAsync(IDbConnection db, int bookingId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        const string sql = """
            SELECT * FROM public.fn_Booking_ConfirmationHeader(@BookingId);
            SELECT * FROM public.fn_Booking_ConfirmationTreatments(@BookingId);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<BookingLocationRow>> sp_Booking_CancelAsync(IDbConnection db, int bookingId, int customerId, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        return db.QueryAsync<BookingLocationRow>("SELECT * FROM public.sp_Booking_Cancel(@BookingId, @CustomerId, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<BookingLocationRow>> sp_Booking_ExpireStaleHoldsAsync(IDbConnection db)
    {
        return db.QueryAsync<BookingLocationRow>("SELECT * FROM public.sp_Booking_ExpireStaleHolds()", commandType: CommandType.Text);
    }

    public Task<SqlMapper.GridReader> sp_Booking_GetMineAsync(IDbConnection db, int customerId, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        const string sql = """
            SELECT * FROM public.fn_Booking_MineHeaders(@CustomerId, @ChainId, @LocationId);
            SELECT * FROM public.fn_Booking_MineTreatments(@CustomerId, @ChainId, @LocationId);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public Task<SqlMapper.GridReader> sp_Booking_GetForLocationAsync(IDbConnection db, int locationId, DateOnly date)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("WorkDate", date.ToDateTime(TimeOnly.MinValue), DbType.Date);
        const string sql = """
            SELECT * FROM public.fn_Booking_ForLocationHeaders(@LocationId, @WorkDate);
            SELECT * FROM public.fn_Booking_ForLocationTreatments(@LocationId, @WorkDate);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public Task<int> sp_Booking_AddProductAsync(IDbConnection db, int bookingId, int productId, int quantity, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("ProductId", productId, DbType.Int32);
        args.Add("Quantity", quantity, DbType.Int32);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Booking_AddProduct(@BookingId, @ProductId, @Quantity, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Booking_RemoveProductAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Booking_RemoveProduct(@Id)", args, commandType: CommandType.Text);
    }

    public Task<int?> sp_Booking_GetLocationIdAsync(IDbConnection db, int bookingId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        return db.ExecuteScalarAsync<int?>("SELECT * FROM public.sp_Booking_GetLocationId(@BookingId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Booking_SetAppointmentStatusAsync(IDbConnection db, int bookingId, int? appointmentStatusId, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("AppointmentStatusId", appointmentStatusId, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Booking_SetAppointmentStatus(@BookingId, @AppointmentStatusId, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<BookingLocationRow>> sp_Booking_CancelAsAdminAsync(IDbConnection db, int bookingId, int? updatedBy, int? cancelReasonId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        args.Add("CancelReasonId", cancelReasonId, DbType.Int32);
        return db.QueryAsync<BookingLocationRow>("SELECT * FROM public.sp_Booking_CancelAsAdmin(@BookingId, @UpdatedBy, @CancelReasonId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Booking_MarkNoShowAsync(IDbConnection db, int bookingId, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("SELECT public.sp_Booking_MarkNoShow(@BookingId, @UpdatedBy)", args, commandType: CommandType.Text);
    }
}
