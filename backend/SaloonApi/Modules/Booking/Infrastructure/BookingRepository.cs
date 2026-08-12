using System.Data;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Booking.Infrastructure;

internal sealed record LocationHoursRow(TimeSpan OpenTime, TimeSpan CloseTime, TimeSpan? BreakStartTime, TimeSpan? BreakEndTime, byte WorkingDaysMask, bool IsHoliday);
internal sealed record TreatmentRow(int Id, int CategoryId, short DurationSlots, decimal Price);
internal sealed record EligiblePairRow(int RoomId, int TherapistId, string ShiftType, TimeSpan ShiftStart, TimeSpan ShiftEnd);
internal sealed record ExistingBookingRow(int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime, string Status);
internal sealed record BlockedRangeRow(int RoomId, TimeSpan StartTime, TimeSpan EndTime);

internal sealed record AvailabilityData(
    LocationHoursRow? Location,
    IReadOnlyList<TreatmentRow> Treatments,
    IReadOnlyList<EligiblePairRow> EligiblePairs,
    IReadOnlyList<ExistingBookingRow> ExistingBookings,
    IReadOnlyList<BlockedRangeRow> BlockedRanges);

// Range-query siblings of the single-date rows above -- LocationHoursRangeRow drops IsHoliday
// (callers resolve holiday dates for the whole range separately, see CatalogRepository), and
// EligiblePairRangeRow carries WorkDate so results can be grouped back out per day in C#.
internal sealed record LocationHoursRangeRow(TimeSpan OpenTime, TimeSpan CloseTime, TimeSpan? BreakStartTime, TimeSpan? BreakEndTime, byte WorkingDaysMask);
internal sealed record EligiblePairRangeRow(DateOnly WorkDate, int RoomId, int TherapistId, string ShiftType, TimeSpan ShiftStart, TimeSpan ShiftEnd);
internal sealed record BlockedRangeRangeRow(DateOnly WorkDate, int RoomId, TimeSpan StartTime, TimeSpan EndTime);

internal sealed record AvailabilityRangeData(
    LocationHoursRangeRow? Location,
    IReadOnlyList<TreatmentRow> Treatments,
    IReadOnlyList<EligiblePairRangeRow> EligiblePairs,
    IReadOnlyList<ExistingBookingRow> ExistingBookings,
    IReadOnlyList<BlockedRangeRangeRow> BlockedRanges);

// (LocationId, RoomId, WorkDate) tuple identifying one affected slot -- Confirm/Cancel/ExpireStaleHolds
// each return one of these per treatment line they touched, since a booking can span several
// independently-scheduled lines (possibly different rooms/dates) that all need cache/SSE invalidation.
internal sealed record BookingLocationRow(int LocationId, int RoomId, DateTime WorkDate);

internal sealed record BookingHeaderRow(int Id, int LocationId, string LocationName, string Status);

internal sealed record MyBookingHeaderRow(
    int Id, int LocationId, string LocationName, string Status, DateTime CreatedDate,
    string? PaymentProvider = null, string? PaymentStatus = null, bool HasReview = false);

// One treatment line of a booking, scheduled or not (schedule fields null until picked). Used both
// for the in-progress draft (GetById, powers refresh-restore) and directly as the API response shape.
internal sealed record BookingTreatmentLineDto(
    int Id, int TreatmentId, string TreatmentName, int? RoomId, int? TherapistId, string? TherapistName,
    DateTime? StartTime, DateTime? EndTime, DateTime? ExpiresAt, short SlotCount, decimal Price);

internal sealed record BookingDetailsDto(
    int Id, int LocationId, string LocationName, string Status, IReadOnlyList<BookingTreatmentLineDto> Treatments);

internal sealed record MyBookingTreatmentRow(
    int BookingId, int TreatmentId, string TreatmentName, int? TherapistId, string? TherapistName,
    DateTime? StartTime, DateTime? EndTime, short SequenceOrder, short SlotCount, decimal Price);

internal sealed record MyBookingTreatmentDto(
    string TreatmentName, string? TherapistName, DateTime? StartTime, DateTime? EndTime, short SlotCount, decimal Price);

internal sealed record MyBookingDto(
    int Id, string LocationName, string Status, DateTime CreatedDate, string? PaymentProvider, string? PaymentStatus,
    bool IsPaid, IReadOnlyList<MyBookingTreatmentDto> Treatments, bool HasReview = false);

internal sealed record AdminBookingHeaderRow(
    int Id, int LocationId, string LocationName, int CustomerId, string CustomerName, string CustomerEmail, string Status,
    bool IsCancelled = false, bool IsNoShow = false,
    int? AppointmentStatusId = null, string? AppointmentStatusName = null, string? AppointmentStatusColorHex = null,
    int? CancelReasonId = null, string? CancelReasonName = null,
    string? PaymentProvider = null, string? PaymentStatus = null);

internal sealed record AdminBookingTreatmentRow(
    int BookingId, int TreatmentId, string TreatmentName, int? RoomId, string? RoomName, int? TherapistId, string? TherapistName,
    DateTime? StartTime, DateTime? EndTime, short SequenceOrder, short SlotCount, decimal Price);

internal sealed record AdminBookingTreatmentDto(
    int? RoomId, string TreatmentName, string? RoomName, string? TherapistName, DateTime? StartTime, DateTime? EndTime,
    short SlotCount, decimal Price, int TreatmentId = 0, int? TherapistId = null);

internal sealed record AdminBookingDto(
    int Id, string LocationName, string CustomerName, string CustomerEmail, string Status,
    IReadOnlyList<AdminBookingTreatmentDto> Treatments,
    int CustomerId = 0,
    bool IsCancelled = false, bool IsNoShow = false,
    int? AppointmentStatusId = null, string? AppointmentStatusName = null, string? AppointmentStatusColorHex = null,
    int? CancelReasonId = null, string? CancelReasonName = null,
    bool IsPaid = false, string? ModeOfPayment = null);

internal sealed record ConfirmationHeaderRow(int Id, string CustomerName, string CustomerEmail, string LocationName);

internal sealed record ConfirmationTreatmentRow(
    int TreatmentId, string TreatmentName, string TherapistName, DateTime StartTime, DateTime EndTime,
    short SlotCount, decimal Price);

internal sealed record ConfirmationDetailsDto(
    int Id, string CustomerName, string CustomerEmail, string LocationName,
    IReadOnlyList<ConfirmationTreatmentRow> Treatments);

internal sealed class BookingRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<AvailabilityData> GetAvailabilityDataAsync(int locationId, IEnumerable<int> treatmentIds, DateOnly date, int? excludeBookingId = null)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetAvailabilityData", new
        {
            LocationId = locationId,
            TreatmentIds = treatmentIds.AsIntIdList(),
            WorkDate = date.ToDateTime(TimeOnly.MinValue),
            ExcludeBookingId = excludeBookingId
        });

        var location = await multi.ReadSingleOrDefaultAsync<LocationHoursRow>();
        var treatments = (await multi.ReadAsync<TreatmentRow>()).ToList();
        var eligible = (await multi.ReadAsync<EligiblePairRow>()).ToList();
        var existing = (await multi.ReadAsync<ExistingBookingRow>()).ToList();
        var blocked = (await multi.ReadAsync<BlockedRangeRow>()).ToList();

        return new AvailabilityData(location, treatments, eligible, existing, blocked);
    }

    // Same eligibility rules as GetAvailabilityDataAsync, but for a whole [from, to] range in one
    // round trip instead of one per date -- see BookingService.GetAvailableDatesAsync, which used to
    // call GetAvailabilityDataAsync once per candidate day.
    public async Task<AvailabilityRangeData> GetAvailabilityDataRangeAsync(
        int locationId, IEnumerable<int> treatmentIds, DateOnly from, DateOnly to, int? excludeBookingId = null)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetAvailabilityDataRange", new
        {
            LocationId = locationId,
            TreatmentIds = treatmentIds.AsIntIdList(),
            FromDate = from.ToDateTime(TimeOnly.MinValue),
            ToDate = to.ToDateTime(TimeOnly.MinValue),
            ExcludeBookingId = excludeBookingId
        });

        var location = await multi.ReadSingleOrDefaultAsync<LocationHoursRangeRow>();
        var treatments = (await multi.ReadAsync<TreatmentRow>()).ToList();
        var eligible = (await multi.ReadAsync<EligiblePairRangeRow>()).ToList();
        var existing = (await multi.ReadAsync<ExistingBookingRow>()).ToList();
        var blocked = (await multi.ReadAsync<BlockedRangeRangeRow>()).ToList();

        return new AvailabilityRangeData(location, treatments, eligible, existing, blocked);
    }

    public async Task<bool> HasLocationRoomOpeningsAsync(int locationId)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<bool>("dbo.sp_Booking_HasLocationRoomOpenings", new { LocationId = locationId });
    }

    public async Task<HashSet<DateOnly>> GetLocationOpenDatesAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        var openDates = await db.QuerySpAsync<DateTime>("dbo.sp_Booking_GetLocationOpenDates", new
        {
            LocationId = locationId,
            FromDate = from.ToDateTime(TimeOnly.MinValue),
            ToDate = to.ToDateTime(TimeOnly.MinValue)
        });

        return openDates.Select(DateOnly.FromDateTime).ToHashSet();
    }

    public async Task<int> CreateDraftAsync(int locationId, int customerId, IEnumerable<int> treatmentIds)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@CustomerId", customerId);
        p.Add("@Treatments", treatmentIds.AsIntIdList());
        p.Add("@CreatedBy", currentUser.UserId);
        p.Add("@BookingId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("dbo.sp_Booking_CreateDraft", p);
        return p.Get<int>("@BookingId");
    }

    public async Task AddTreatmentAsync(int bookingId, int customerId, int treatmentId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Booking_AddTreatment", new
        {
            BookingId = bookingId, CustomerId = customerId, TreatmentId = treatmentId, CreatedBy = currentUser.UserId
        });
    }

    public async Task<BookingLocationRow?> RemoveTreatmentAsync(int bookingId, int customerId, int treatmentId)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<BookingLocationRow>("dbo.sp_Booking_RemoveTreatment", new
        {
            BookingId = bookingId, CustomerId = customerId, TreatmentId = treatmentId, UpdatedBy = currentUser.UserId
        });
    }

    public async Task<(DateTime ExpiresAt, int LocationId)> ScheduleTreatmentAsync(
        int bookingId, int customerId, int treatmentId, int roomId, int therapistId, DateTime start, DateTime end)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@BookingId", bookingId);
        p.Add("@CustomerId", customerId);
        p.Add("@TreatmentId", treatmentId);
        p.Add("@RoomId", roomId);
        p.Add("@TherapistId", therapistId);
        p.Add("@StartTime", start);
        p.Add("@EndTime", end);
        p.Add("@UpdatedBy", currentUser.UserId);
        p.Add("@ExpiresAt", dbType: DbType.DateTime2, direction: ParameterDirection.Output);
        p.Add("@LocationId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("dbo.sp_Booking_ScheduleTreatment", p);
        // SQL Server DATETIME2 (and Dapper) carry no timezone -- SYSUTCDATETIME() is UTC in value
        // but comes back Kind=Unspecified, which System.Text.Json serializes with no 'Z'/offset.
        // The browser's `new Date(...)` then reads that as *local* time, silently corrupting the
        // countdown for anyone not in UTC. StartTime/EndTime are venue-local wall-clock times and
        // are meant to be read at face value, so only ExpiresAt (an absolute instant, used for
        // real elapsed-time math) needs this fix.
        return (DateTime.SpecifyKind(p.Get<DateTime>("@ExpiresAt"), DateTimeKind.Utc), p.Get<int>("@LocationId"));
    }

    public async Task<int> RescheduleConfirmedAsync(int bookingId, int treatmentId, int roomId, int therapistId, DateTime start, DateTime end)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@BookingId", bookingId);
        p.Add("@TreatmentId", treatmentId);
        p.Add("@RoomId", roomId);
        p.Add("@TherapistId", therapistId);
        p.Add("@StartTime", start);
        p.Add("@EndTime", end);
        p.Add("@UpdatedBy", currentUser.UserId);
        p.Add("@LocationId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("dbo.sp_Booking_RescheduleConfirmed", p);
        return p.Get<int>("@LocationId");
    }

    public async Task<int> ReassignTherapistAsync(int bookingId, int treatmentId, int newTherapistId, string? reason)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@BookingId", bookingId);
        p.Add("@TreatmentId", treatmentId);
        p.Add("@NewTherapistId", newTherapistId);
        p.Add("@Reason", reason);
        p.Add("@UpdatedBy", currentUser.UserId);
        p.Add("@LocationId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("dbo.sp_Booking_ReassignTherapist", p);
        return p.Get<int>("@LocationId");
    }

    public async Task<BookingDetailsDto?> GetByIdAsync(int bookingId, int customerId)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetById", new { BookingId = bookingId, CustomerId = customerId });

        var header = await multi.ReadSingleOrDefaultAsync<BookingHeaderRow>();
        var lines = (await multi.ReadAsync<BookingTreatmentLineDto>())
            .Select(l => l.ExpiresAt is null ? l : l with { ExpiresAt = DateTime.SpecifyKind(l.ExpiresAt.Value, DateTimeKind.Utc) })
            .ToList();

        return header is null ? null : new BookingDetailsDto(header.Id, header.LocationId, header.LocationName, header.Status, lines);
    }

    public async Task<int?> GetCustomerIdAsync(int bookingId)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int?>("dbo.sp_Booking_GetCustomerId", new { BookingId = bookingId });
    }

    public async Task<IReadOnlyList<BookingLocationRow>> ConfirmAsync(int bookingId, int customerId = 0)
    {
        if (customerId <= 0)
        {
            var resolved = await GetCustomerIdAsync(bookingId);
            if (resolved is not { } cid || cid <= 0)
                throw new KeyNotFoundException($"Booking {bookingId} not found or has invalid customer.");
            customerId = cid;
        }

        using var db = factory.Create();
        return (await db.QuerySpAsync<BookingLocationRow>(
            "dbo.sp_Booking_Confirm",
            new { BookingId = bookingId, CustomerId = customerId, UpdatedBy = currentUser.UserId })).ToList();
    }

    public async Task<ConfirmationDetailsDto?> GetConfirmationDetailsAsync(int bookingId)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetConfirmationDetails", new { BookingId = bookingId });

        var header = await multi.ReadSingleOrDefaultAsync<ConfirmationHeaderRow>();
        var treatments = (await multi.ReadAsync<ConfirmationTreatmentRow>()).ToList();

        return header is null
            ? null
            : new ConfirmationDetailsDto(header.Id, header.CustomerName, header.CustomerEmail, header.LocationName, treatments);
    }

    public async Task<IReadOnlyList<BookingLocationRow>> CancelAsync(int bookingId, int customerId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<BookingLocationRow>(
            "dbo.sp_Booking_Cancel",
            new { BookingId = bookingId, CustomerId = customerId, UpdatedBy = currentUser.UserId })).ToList();
    }

    public async Task<IReadOnlyList<BookingLocationRow>> ExpireStaleHoldsAsync()
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<BookingLocationRow>("dbo.sp_Booking_ExpireStaleHolds")).ToList();
    }

    public async Task<IReadOnlyList<MyBookingDto>> GetMineAsync(int customerId, int? chainId = null, int? locationId = null)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetMine", new { CustomerId = customerId, ChainId = chainId, LocationId = locationId });

        var bookings = (await multi.ReadAsync<MyBookingHeaderRow>()).ToList();
        var treatments = (await multi.ReadAsync<MyBookingTreatmentRow>()).ToList();

        return bookings.Select(b => new MyBookingDto(
            b.Id, b.LocationName, b.Status, b.CreatedDate,
            b.PaymentProvider,
            b.PaymentStatus,
            b.PaymentStatus?.Equals("Succeeded", StringComparison.OrdinalIgnoreCase) == true || b.Status.Equals("Confirmed", StringComparison.OrdinalIgnoreCase),
            treatments.Where(t => t.BookingId == b.Id)
                      .OrderBy(t => t.SequenceOrder)
                      .Select(t => new MyBookingTreatmentDto(t.TreatmentName, t.TherapistName, t.StartTime, t.EndTime, t.SlotCount, t.Price))
                      .ToList(),
            b.HasReview)).ToList();
    }

    public async Task<IReadOnlyList<AdminBookingDto>> GetForLocationAsync(int locationId, DateOnly date)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetForLocation", new
        {
            LocationId = locationId,
            WorkDate = date.ToDateTime(TimeOnly.MinValue)
        });

        var bookings = (await multi.ReadAsync<AdminBookingHeaderRow>()).ToList();
        var treatments = (await multi.ReadAsync<AdminBookingTreatmentRow>()).ToList();

        return bookings.Select(b => new AdminBookingDto(
            b.Id, b.LocationName, b.CustomerName, b.CustomerEmail, b.Status,
            treatments.Where(t => t.BookingId == b.Id)
                      .OrderBy(t => t.SequenceOrder)
                      .Select(t => new AdminBookingTreatmentDto(
                          t.RoomId, t.TreatmentName, t.RoomName, t.TherapistName, t.StartTime, t.EndTime, t.SlotCount, t.Price,
                          t.TreatmentId, t.TherapistId))
                      .ToList(),
            b.CustomerId,
            b.IsCancelled, b.IsNoShow,
            b.AppointmentStatusId, b.AppointmentStatusName, b.AppointmentStatusColorHex,
            b.CancelReasonId, b.CancelReasonName,
            b.PaymentStatus?.Equals("Succeeded", StringComparison.OrdinalIgnoreCase) == true, b.PaymentProvider)).ToList();
    }

    public async Task<int?> GetLocationIdAsync(int bookingId)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int?>("dbo.sp_Booking_GetLocationId", new { BookingId = bookingId });
    }

    public async Task SetAppointmentStatusAsync(int bookingId, int? appointmentStatusId, int? updatedBy)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Booking_SetAppointmentStatus", new
        {
            BookingId = bookingId, AppointmentStatusId = appointmentStatusId, UpdatedBy = updatedBy
        });
    }

    public async Task<IReadOnlyList<BookingLocationRow>> CancelAsAdminAsync(int bookingId, int? cancelReasonId = null)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<BookingLocationRow>(
            "dbo.sp_Booking_CancelAsAdmin",
            new { BookingId = bookingId, UpdatedBy = currentUser.RequireUserId(), CancelReasonId = cancelReasonId })).ToList();
    }

    public async Task MarkNoShowAsync(int bookingId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Booking_MarkNoShow", new { BookingId = bookingId, UpdatedBy = currentUser.RequireUserId() });
    }
}
