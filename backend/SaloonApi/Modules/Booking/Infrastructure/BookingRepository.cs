using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Booking.Infrastructure;

// Init-property (not positional-constructor) records: Dapper materializes these by matching
// property NAME to column name, independent of column order/count -- a missing column leaves the
// property at its default, an extra column is ignored. Positional records instead require the SQL
// column order to exactly match the constructor's parameter order, which is what caused the
// EligiblePairRow/BlockedRangeRangeRow column-order crash this shape change fixes for good.
internal sealed record LocationHoursRow
{
    public TimeOnly OpenTime { get; init; }
    public TimeOnly CloseTime { get; init; }
    public TimeOnly? BreakStartTime { get; init; }
    public TimeOnly? BreakEndTime { get; init; }
    public short WorkingDaysMask { get; init; }
    public bool IsHoliday { get; init; }
}

internal sealed record LocationHoursRangeHeaderRow
{
    public TimeOnly? BreakStartTime { get; init; }
    public TimeOnly? BreakEndTime { get; init; }
    public short WorkingDaysMask { get; init; }
}

internal sealed record TreatmentRow
{
    public int Id { get; init; }
    public int CategoryId { get; init; }
    public short DurationSlots { get; init; }
    public decimal Price { get; init; }
}

internal sealed record EligiblePairRow
{
    public int RoomId { get; init; }
    public int TherapistId { get; init; }
    public string ShiftType { get; init; } = "";
    public TimeOnly ShiftStart { get; init; }
    public TimeOnly ShiftEnd { get; init; }
    public DateOnly WorkDate { get; init; }
}

internal sealed record ExistingBookingRow
{
    public int RoomId { get; init; }
    public int TherapistId { get; init; }
    public DateTime StartTime { get; init; }
    public DateTime EndTime { get; init; }
    public string Status { get; init; } = "";
}

internal sealed record BlockedRangeRangeRow
{
    public int RoomId { get; init; }
    public TimeOnly StartTime { get; init; }
    public TimeOnly EndTime { get; init; }
    public DateOnly WorkDate { get; init; }
}

internal sealed record AvailabilityData(
    LocationHoursRow Location,
    IReadOnlyList<TreatmentRow> Treatments,
    IReadOnlyList<EligiblePairRow> EligiblePairs,
    IReadOnlyList<ExistingBookingRow> ExistingBookings,
    IReadOnlyList<BlockedRangeRangeRow> BlockedRanges);

internal sealed record LocationHoursRangeRow
{
    public DateOnly WorkDate { get; init; }
    public TimeOnly OpenTime { get; init; }
    public TimeOnly CloseTime { get; init; }
}

internal sealed record AvailabilityRangeData(
    LocationHoursRangeHeaderRow Location,
    IReadOnlyList<LocationHoursRangeRow> DayHours,
    IReadOnlyList<TreatmentRow> Treatments,
    IReadOnlyList<EligiblePairRow> EligiblePairs,
    IReadOnlyList<ExistingBookingRow> ExistingBookings,
    IReadOnlyList<BlockedRangeRangeRow> BlockedRanges);

internal sealed record BookingTreatmentLineDto(
    int BookingTreatmentId, int TreatmentId, string TreatmentName, short DurationSlots, short PreTimeMinutes, decimal Price,
    DateTime? StartTime, DateTime? EndTime, int? RoomId, string? RoomName, int? TherapistId, string? TherapistName, DateTime? ExpiresAt);

internal sealed record BookingDetailsDto(int Id, int LocationId, string LocationName, string Status, IReadOnlyList<BookingTreatmentLineDto> Treatments);

internal sealed record MyBookingDto(
    int Id, int LocationId, string LocationName, string Status, DateTime CreatedDate, DateTime? ScheduledStart, DateTime? ScheduledEnd,
    decimal TotalPrice, int TreatmentCount, IReadOnlyList<string> TreatmentNames,
    int? AppointmentStatusId = null, string? AppointmentStatusName = null, string? AppointmentStatusColorHex = null,
    int? CancelReasonId = null, string? CancelReasonName = null, bool IsPaid = false, string? PaymentProvider = null);

internal sealed record ConfirmationTreatmentLineDto(
    int BookingTreatmentId, int TreatmentId, string TreatmentName, short DurationSlots, short PreTimeMinutes, decimal Price,
    DateTime StartTime, DateTime EndTime, int RoomId, string RoomName, int TherapistId, string TherapistName);

internal sealed record ConfirmationDetailsDto(
    int Id, int LocationId, string LocationName, int CustomerId, string CustomerName, string CustomerEmail,
    IReadOnlyList<ConfirmationTreatmentLineDto> Treatments);

internal sealed record StaffBookingRow(
    int BookingId, int LocationId, string LocationName, int CustomerId, string CustomerName, string CustomerEmail, string? CustomerPhone,
    string Status, DateTime CreatedDate,
    int BookingTreatmentId, int TreatmentId, string TreatmentName, short DurationSlots, short PreTimeMinutes, decimal Price,
    DateTime? StartTime, DateTime? EndTime, int? RoomId, string? RoomName, int? TherapistId, string? TherapistName, DateTime? ExpiresAt,
    bool IsCancelled, bool IsNoShow,
    int? AppointmentStatusId, string? AppointmentStatusName, string? AppointmentStatusColorHex,
    int? CancelReasonId, string? CancelReasonName, string? PaymentStatus, string? PaymentProvider);

internal sealed record StaffBookingTreatmentLineDto(
    int BookingTreatmentId, int TreatmentId, string TreatmentName, short DurationSlots, short PreTimeMinutes, decimal Price,
    DateTime? StartTime, DateTime? EndTime, int? RoomId, string? RoomName, int? TherapistId, string? TherapistName, DateTime? ExpiresAt);

internal sealed record StaffBookingSummaryDto(
    int BookingId, int LocationId, string LocationName, int CustomerId, string CustomerName, string CustomerEmail, string? CustomerPhone,
    string Status, DateTime CreatedDate, IReadOnlyList<StaffBookingTreatmentLineDto> Treatments,
    int? AppointmentStatusId = null, string? AppointmentStatusName = null, string? AppointmentStatusColorHex = null,
    int? CancelReasonId = null, string? CancelReasonName = null, bool IsPaid = false, string? PaymentProvider = null);

internal sealed record AdminBookingDto(
    int BookingId, int LocationId, string LocationName, int CustomerId, string CustomerName, string CustomerEmail, string? CustomerPhone,
    string Status, DateTime CreatedDate, IReadOnlyList<StaffBookingTreatmentLineDto> Treatments,
    int? AppointmentStatusId = null, string? AppointmentStatusName = null, string? AppointmentStatusColorHex = null,
    int? CancelReasonId = null, string? CancelReasonName = null, bool IsPaid = false, string? PaymentProvider = null);

internal sealed record BookingLocationRow(int LocationId, int? RoomId, DateOnly WorkDate);

internal sealed record BookingHeaderRow(int Id, int LocationId, string LocationName, string Status);

internal sealed class BookingRepository(SqlConnectionFactory factory, ICurrentUser currentUser, BookingDbService bookingDb)
{
    public async Task<AvailabilityData> GetAvailabilityDataAsync(int locationId, IEnumerable<int> treatmentIds, DateOnly date, int? excludeBookingId = null)
    {
        using var db = factory.Create();
        using var multi = await bookingDb.sp_Booking_GetAvailabilityDataAsync(db, locationId, treatmentIds.ToArray(), date, excludeBookingId);

        var location = await multi.ReadSingleOrDefaultAsync<LocationHoursRow>()
            ?? throw new InvalidOperationException($"Location {locationId} not found.");
        var treatments = (await multi.ReadAsync<TreatmentRow>()).ToList();
        var eligible = (await multi.ReadAsync<EligiblePairRow>()).ToList();
        var existing = (await multi.ReadAsync<ExistingBookingRow>()).ToList();
        var blocked = (await multi.ReadAsync<BlockedRangeRangeRow>()).ToList();

        return new AvailabilityData(location, treatments, eligible, existing, blocked);
    }

    public async Task<AvailabilityRangeData> GetAvailabilityDataRangeAsync(
        int locationId, IEnumerable<int> treatmentIds, DateOnly from, DateOnly to, int? excludeBookingId = null)
    {
        using var db = factory.Create();
        using var multi = await bookingDb.sp_Booking_GetAvailabilityDataRangeAsync(db, locationId, treatmentIds.ToArray(), from, to, excludeBookingId);

        var location = await multi.ReadSingleOrDefaultAsync<LocationHoursRangeHeaderRow>()
            ?? throw new InvalidOperationException($"Location {locationId} not found.");
        var dayHours = (await multi.ReadAsync<LocationHoursRangeRow>()).ToList();
        var treatments = (await multi.ReadAsync<TreatmentRow>()).ToList();
        var eligible = (await multi.ReadAsync<EligiblePairRow>()).ToList();
        var existing = (await multi.ReadAsync<ExistingBookingRow>()).ToList();
        var blocked = (await multi.ReadAsync<BlockedRangeRangeRow>()).ToList();

        return new AvailabilityRangeData(location, dayHours, treatments, eligible, existing, blocked);
    }

    public async Task<bool> HasLocationRoomOpeningsAsync(int locationId)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_HasLocationRoomOpeningsAsync(db, locationId);
    }

    public async Task<HashSet<DateOnly>> GetLocationOpenDatesAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        var openDates = await bookingDb.sp_Booking_GetLocationOpenDatesAsync(db, locationId, from, to);
        return openDates.ToHashSet();
    }

    public async Task<int> CreateDraftAsync(int locationId, int customerId, IEnumerable<int> treatmentIds)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_CreateDraftAsync(db, locationId, customerId, treatmentIds.ToArray(), currentUser.UserId);
    }

    public async Task AddTreatmentAsync(int bookingId, int customerId, int treatmentId)
    {
        using var db = factory.Create();
        await bookingDb.sp_Booking_AddTreatmentAsync(db, bookingId, customerId, treatmentId, currentUser.UserId);
    }

    public async Task<BookingLocationRow?> RemoveTreatmentAsync(int bookingId, int customerId, int treatmentId)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_RemoveTreatmentAsync(db, bookingId, customerId, treatmentId, currentUser.UserId);
    }

    public async Task<(DateTime ExpiresAt, int LocationId)> ScheduleTreatmentAsync(
        int bookingId, int customerId, int treatmentId, int roomId, int therapistId, DateTime start, DateTime end)
    {
        using var db = factory.Create();
        var row = await bookingDb.sp_Booking_ScheduleTreatmentAsync(db, bookingId, customerId, treatmentId, roomId, therapistId, start, end, currentUser.UserId);
        if (row is null) throw new InvalidOperationException("Failed to schedule treatment.");
        return (DateTime.SpecifyKind(row.ExpiresAt, DateTimeKind.Utc), row.LocationId);
    }

    public async Task<int> RescheduleConfirmedAsync(int bookingId, int treatmentId, int roomId, int therapistId, DateTime start, DateTime end)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_RescheduleConfirmedAsync(db, bookingId, treatmentId, roomId, therapistId, start, end, currentUser.UserId);
    }

    public async Task<int> ReassignTherapistAsync(int bookingId, int treatmentId, int newTherapistId, string? reason)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_ReassignTherapistAsync(db, bookingId, treatmentId, newTherapistId, reason, currentUser.UserId);
    }

    public async Task<BookingDetailsDto?> GetByIdAsync(int bookingId, int customerId)
    {
        using var db = factory.Create();
        using var multi = await bookingDb.sp_Booking_GetByIdAsync(db, bookingId, customerId);

        var header = await multi.ReadSingleOrDefaultAsync<BookingHeaderRow>();
        var lines = (await multi.ReadAsync<BookingTreatmentLineDto>())
            .Select(l => l.ExpiresAt is null ? l : l with { ExpiresAt = DateTime.SpecifyKind(l.ExpiresAt.Value, DateTimeKind.Utc) })
            .ToList();

        return header is null ? null : new BookingDetailsDto(header.Id, header.LocationId, header.LocationName, header.Status, lines);
    }

    public async Task<int?> GetCustomerIdAsync(int bookingId)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_GetCustomerIdAsync(db, bookingId);
    }

    public async Task<IReadOnlyList<BookingLocationRow>> ConfirmAsync(int bookingId, int customerId = 0)
    {
        if (customerId <= 0)
        {
            var resolved = await GetCustomerIdAsync(bookingId);
            if (resolved is not { } cid || cid <= 0)
                throw new InvalidOperationException($"Booking {bookingId} has no associated customer.");
            customerId = cid;
        }

        using var db = factory.Create();
        var rows = await bookingDb.sp_Booking_ConfirmAsync(db, bookingId, customerId, currentUser.UserId);
        return rows.ToList();
    }

    public async Task<ConfirmationDetailsDto?> GetConfirmationDetailsAsync(int bookingId)
    {
        using var db = factory.Create();
        using var multi = await bookingDb.sp_Booking_GetConfirmationDetailsAsync(db, bookingId);

        var header = await multi.ReadSingleOrDefaultAsync<ConfirmationHeaderRow>();
        var lines = (await multi.ReadAsync<ConfirmationTreatmentLineDto>()).ToList();

        return header is null ? null : new ConfirmationDetailsDto(header.Id, header.LocationId, header.LocationName, header.CustomerId, header.CustomerName, header.CustomerEmail, lines);
    }

    private sealed record ConfirmationHeaderRow(int Id, int LocationId, string LocationName, int CustomerId, string CustomerName, string CustomerEmail);

    public async Task<IReadOnlyList<BookingLocationRow>> CancelAsync(int bookingId, int customerId)
    {
        using var db = factory.Create();
        var rows = await bookingDb.sp_Booking_CancelAsync(db, bookingId, customerId, currentUser.UserId);
        return rows.ToList();
    }

    public async Task<IReadOnlyList<BookingLocationRow>> ExpireStaleHoldsAsync()
    {
        using var db = factory.Create();
        var rows = await bookingDb.sp_Booking_ExpireStaleHoldsAsync(db);
        return rows.ToList();
    }

    public async Task<IReadOnlyList<MyBookingDto>> GetMineAsync(int customerId, int? chainId = null, int? locationId = null)
    {
        using var db = factory.Create();
        using var multi = await bookingDb.sp_Booking_GetMineAsync(db, customerId, chainId, locationId);

        var headers = (await multi.ReadAsync<BookingMineHeaderRow>()).ToList();
        var treatments = (await multi.ReadAsync<BookingMineTreatmentRow>()).ToList();
        var treatmentsByBooking = treatments.GroupBy(t => t.BookingId).ToDictionary(g => g.Key, g => g.ToList());

        return headers.Select(h =>
        {
            var txs = treatmentsByBooking.GetValueOrDefault(h.BookingId, []);
            var minStart = txs.Where(t => t.StartTime.HasValue).Min(t => t.StartTime);
            var maxEnd = txs.Where(t => t.EndTime.HasValue).Max(t => t.EndTime);
            var totalPrice = txs.Sum(t => t.Price);
            var names = txs.Select(t => t.TreatmentName).Distinct().ToList();

            return new MyBookingDto(
                h.BookingId, h.LocationId, h.LocationName, h.Status, h.CreatedDate, minStart, maxEnd, totalPrice, txs.Count, names,
                h.AppointmentStatusId, h.AppointmentStatusName, h.AppointmentStatusColorHex,
                h.CancelReasonId, h.CancelReasonName,
                string.Equals(h.PaymentStatus, "Succeeded", StringComparison.OrdinalIgnoreCase), h.PaymentProvider);
        }).ToList();
    }

    private sealed record BookingMineHeaderRow(
        int BookingId, int LocationId, string LocationName, string Status, DateTime CreatedDate,
        int? AppointmentStatusId, string? AppointmentStatusName, string? AppointmentStatusColorHex,
        int? CancelReasonId, string? CancelReasonName, string? PaymentStatus, string? PaymentProvider);

    private sealed record BookingMineTreatmentRow(int BookingId, string TreatmentName, decimal Price, DateTime? StartTime, DateTime? EndTime);

    public async Task<IReadOnlyList<StaffBookingSummaryDto>> GetForLocationAsync(int locationId, DateOnly date)
    {
        using var db = factory.Create();
        using var multi = await bookingDb.sp_Booking_GetForLocationAsync(db, locationId, date);

        var rawLines = (await multi.ReadAsync<StaffBookingRow>()).ToList();

        return rawLines
            .GroupBy(b => b.BookingId)
            .Select(g =>
            {
                var first = g.First();
                var treatments = g.Select(b => new StaffBookingTreatmentLineDto(
                    b.BookingTreatmentId, b.TreatmentId, b.TreatmentName, b.DurationSlots, b.PreTimeMinutes, b.Price,
                    b.StartTime, b.EndTime, b.RoomId, b.RoomName, b.TherapistId, b.TherapistName,
                    b.ExpiresAt is null ? null : DateTime.SpecifyKind(b.ExpiresAt.Value, DateTimeKind.Utc)
                )).ToList();

                return new StaffBookingSummaryDto(
                    first.BookingId, first.LocationId, first.LocationName, first.CustomerId, first.CustomerName, first.CustomerEmail, first.CustomerPhone,
                    first.Status, first.CreatedDate, treatments,
                    first.AppointmentStatusId, first.AppointmentStatusName, first.AppointmentStatusColorHex,
                    first.CancelReasonId, first.CancelReasonName,
                    string.Equals(first.PaymentStatus, "Succeeded", StringComparison.OrdinalIgnoreCase), first.PaymentProvider);
            }).ToList();
    }

    public async Task<int?> GetLocationIdAsync(int bookingId)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_GetLocationIdAsync(db, bookingId);
    }

    public async Task SetAppointmentStatusAsync(int bookingId, int? appointmentStatusId, int? updatedBy)
    {
        using var db = factory.Create();
        await bookingDb.sp_Booking_SetAppointmentStatusAsync(db, bookingId, appointmentStatusId, updatedBy);
    }

    public async Task<IReadOnlyList<BookingLocationRow>> CancelAsAdminAsync(int bookingId, int? cancelReasonId = null)
    {
        using var db = factory.Create();
        var rows = await bookingDb.sp_Booking_CancelAsAdminAsync(db, bookingId, currentUser.RequireUserId(), cancelReasonId);
        return rows.ToList();
    }

    public async Task MarkNoShowAsync(int bookingId)
    {
        using var db = factory.Create();
        await bookingDb.sp_Booking_MarkNoShowAsync(db, bookingId, currentUser.RequireUserId());
    }
}
