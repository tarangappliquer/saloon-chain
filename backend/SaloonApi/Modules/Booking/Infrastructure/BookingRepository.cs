using System.Data;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Booking.Infrastructure;

internal sealed record LocationHoursRow(TimeSpan OpenTime, TimeSpan CloseTime, byte WorkingDaysMask, bool IsHoliday);
internal sealed record TreatmentRow(int Id, int CategoryId, short DurationSlots, decimal Price);
internal sealed record EligiblePairRow(int RoomId, int TherapistId, string ShiftType, TimeSpan ShiftStart, TimeSpan ShiftEnd);
internal sealed record ExistingBookingRow(int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime, string Status);

internal sealed record AvailabilityData(
    LocationHoursRow? Location,
    IReadOnlyList<TreatmentRow> Treatments,
    IReadOnlyList<EligiblePairRow> EligiblePairs,
    IReadOnlyList<ExistingBookingRow> ExistingBookings);

internal sealed record BookingLocationRow(int LocationId, int RoomId, DateTime WorkDate);

internal sealed record MyBookingRow(
    int Id, int LocationId, string LocationName, int RoomId, int TherapistId, string TherapistName,
    DateTime StartTime, DateTime EndTime, string Status);

internal sealed record MyBookingTreatmentRow(
    int BookingId, int TreatmentId, string TreatmentName, short SequenceOrder, short SlotCount, decimal Price);

internal sealed record MyBookingTreatmentDto(string TreatmentName, short SlotCount, decimal Price);

internal sealed record MyBookingDto(
    int Id, string LocationName, string TherapistName, DateTime StartTime, DateTime EndTime, string Status,
    IReadOnlyList<MyBookingTreatmentDto> Treatments);

internal sealed record AdminBookingRow(
    int Id, int LocationId, string LocationName, int RoomId, string RoomName, int TherapistId, string TherapistName,
    int CustomerId, string CustomerName, string CustomerEmail, DateTime StartTime, DateTime EndTime, string Status);

internal sealed record AdminBookingDto(
    int Id, string LocationName, string RoomName, string TherapistName, string CustomerName, string CustomerEmail,
    DateTime StartTime, DateTime EndTime, string Status, IReadOnlyList<MyBookingTreatmentDto> Treatments);

internal sealed record ConfirmationHeaderRow(
    int Id, string CustomerName, string CustomerEmail, string LocationName, string TherapistName,
    DateTime StartTime, DateTime EndTime);

internal sealed record ConfirmationTreatmentRow(int TreatmentId, string TreatmentName, short SlotCount, decimal Price);

internal sealed record ConfirmationDetailsDto(
    int Id, string CustomerName, string CustomerEmail, string LocationName, string TherapistName,
    DateTime StartTime, DateTime EndTime, IReadOnlyList<ConfirmationTreatmentRow> Treatments);

internal sealed class BookingRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<AvailabilityData> GetAvailabilityDataAsync(int locationId, IEnumerable<int> treatmentIds, DateOnly date)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetAvailabilityData", new
        {
            LocationId = locationId,
            TreatmentIds = treatmentIds.AsIntIdList(),
            WorkDate = date.ToDateTime(TimeOnly.MinValue)
        });

        var location = await multi.ReadSingleOrDefaultAsync<LocationHoursRow>();
        var treatments = (await multi.ReadAsync<TreatmentRow>()).ToList();
        var eligible = (await multi.ReadAsync<EligiblePairRow>()).ToList();
        var existing = (await multi.ReadAsync<ExistingBookingRow>()).ToList();

        return new AvailabilityData(location, treatments, eligible, existing);
    }

    public async Task<(int BookingId, DateTime ExpiresAt)> CreateHoldAsync(
        int locationId, int roomId, int therapistId, int customerId,
        DateTime start, DateTime end, IEnumerable<int> treatmentIds)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@RoomId", roomId);
        p.Add("@TherapistId", therapistId);
        p.Add("@CustomerId", customerId);
        p.Add("@StartTime", start);
        p.Add("@EndTime", end);
        p.Add("@Treatments", treatmentIds.AsIntIdList());
        p.Add("@CreatedBy", currentUser.UserId);
        p.Add("@BookingId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("@ExpiresAt", dbType: DbType.DateTime2, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("dbo.sp_Booking_CreateHold", p);
        return (p.Get<int>("@BookingId"), p.Get<DateTime>("@ExpiresAt"));
    }

    public async Task<BookingLocationRow> ConfirmAsync(int bookingId, int customerId)
    {
        using var db = factory.Create();
        return (await db.QuerySingleSpAsync<BookingLocationRow>(
            "dbo.sp_Booking_Confirm",
            new { BookingId = bookingId, CustomerId = customerId, UpdatedBy = currentUser.UserId }))!;
    }

    public async Task<ConfirmationDetailsDto?> GetConfirmationDetailsAsync(int bookingId)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetConfirmationDetails", new { BookingId = bookingId });

        var header = await multi.ReadSingleOrDefaultAsync<ConfirmationHeaderRow>();
        var treatments = (await multi.ReadAsync<ConfirmationTreatmentRow>()).ToList();

        return header is null
            ? null
            : new ConfirmationDetailsDto(
                header.Id, header.CustomerName, header.CustomerEmail, header.LocationName, header.TherapistName,
                header.StartTime, header.EndTime, treatments);
    }

    public async Task<BookingLocationRow> CancelAsync(int bookingId, int customerId)
    {
        using var db = factory.Create();
        return (await db.QuerySingleSpAsync<BookingLocationRow>(
            "dbo.sp_Booking_Cancel",
            new { BookingId = bookingId, CustomerId = customerId, UpdatedBy = currentUser.UserId }))!;
    }

    public async Task<IReadOnlyList<BookingLocationRow>> ExpireStaleHoldsAsync()
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<BookingLocationRow>("dbo.sp_Booking_ExpireStaleHolds")).ToList();
    }

    public async Task<IReadOnlyList<MyBookingDto>> GetMineAsync(int customerId)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetMine", new { CustomerId = customerId });

        var bookings = (await multi.ReadAsync<MyBookingRow>()).ToList();
        var treatments = (await multi.ReadAsync<MyBookingTreatmentRow>()).ToList();

        return bookings.Select(b => new MyBookingDto(
            b.Id, b.LocationName, b.TherapistName, b.StartTime, b.EndTime, b.Status,
            treatments.Where(t => t.BookingId == b.Id)
                      .OrderBy(t => t.SequenceOrder)
                      .Select(t => new MyBookingTreatmentDto(t.TreatmentName, t.SlotCount, t.Price))
                      .ToList())).ToList();
    }

    public async Task<IReadOnlyList<AdminBookingDto>> GetForLocationAsync(int locationId, DateOnly date)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Booking_GetForLocation", new
        {
            LocationId = locationId,
            WorkDate = date.ToDateTime(TimeOnly.MinValue)
        });

        var bookings = (await multi.ReadAsync<AdminBookingRow>()).ToList();
        var treatments = (await multi.ReadAsync<MyBookingTreatmentRow>()).ToList();

        return bookings.Select(b => new AdminBookingDto(
            b.Id, b.LocationName, b.RoomName, b.TherapistName, b.CustomerName, b.CustomerEmail,
            b.StartTime, b.EndTime, b.Status,
            treatments.Where(t => t.BookingId == b.Id)
                      .OrderBy(t => t.SequenceOrder)
                      .Select(t => new MyBookingTreatmentDto(t.TreatmentName, t.SlotCount, t.Price))
                      .ToList())).ToList();
    }

    public async Task<BookingLocationRow> CancelAsAdminAsync(int bookingId)
    {
        using var db = factory.Create();
        return (await db.QuerySingleSpAsync<BookingLocationRow>(
            "dbo.sp_Booking_CancelAsAdmin",
            new { BookingId = bookingId, UpdatedBy = currentUser.RequireUserId() }))!;
    }
}
