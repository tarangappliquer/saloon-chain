using System.Globalization;
using System.Text;
using System.Text.Json;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Booking.Application;

internal sealed class BookingService(
    BookingRepository repo, CatalogRepository catalog, IAvailabilityCache cache, SseBroadcaster sse, IBackgroundEmailQueue emailQueue)
{
    public async Task<IReadOnlyList<DateOnly>> GetAvailableDatesAsync(int locationId, DateOnly from, DateOnly to)
    {
        // ponytail: reuses sp_Booking_GetAvailabilityData with an empty treatment list just to
        // read location hours/working-days mask, rather than adding a proc for one field.
        var data = await repo.GetAvailabilityDataAsync(locationId, [], from);
        var mask = data.Location?.WorkingDaysMask ?? 0;
        var holidays = (await catalog.GetHolidayDatesAsync(locationId, from, to)).ToHashSet();

        var dates = new List<DateOnly>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var bit = ((int)d.DayOfWeek + 6) % 7; // Mon=bit0 .. Sun=bit6
            if ((mask & (1 << bit)) != 0 && !holidays.Contains(d)) dates.Add(d);
        }
        return dates;
    }

    public async Task<IReadOnlyList<AvailableSlot>> GetAvailableSlotsAsync(int locationId, IReadOnlyList<int> treatmentIds, DateOnly date)
    {
        var cached = await cache.GetAsync(locationId, date, treatmentIds);
        if (cached is not null)
            return JsonSerializer.Deserialize<List<AvailableSlot>>(cached)!;

        var data = await repo.GetAvailabilityDataAsync(locationId, treatmentIds, date);
        if (data.Location is null || data.Location.IsHoliday) return [];

        var totalSlots = data.Treatments.Sum(t => t.DurationSlots);
        var pairs = data.EligiblePairs.Select(p => new EligiblePair(p.RoomId, p.TherapistId, p.ShiftStart, p.ShiftEnd)).ToList();
        var existing = data.ExistingBookings.Select(b => new ExistingBooking(b.RoomId, b.TherapistId, b.StartTime, b.EndTime, b.Status == "Draft")).ToList();

        var slots = SlotCalculator.ComputeAvailableSlots(
            date, data.Location.OpenTime, data.Location.CloseTime, totalSlots, pairs, existing);

        await cache.SetAsync(locationId, date, treatmentIds, JsonSerializer.Serialize(slots), TimeSpan.FromSeconds(60));
        return slots;
    }

    // Creates the draft "cart" the instant treatments are picked -- no schedule yet, so nothing to
    // invalidate in the availability cache/SSE (nothing became unavailable to anyone else).
    public Task<int> CreateDraftAsync(int locationId, int customerId, IReadOnlyList<int> treatmentIds) =>
        repo.CreateDraftAsync(locationId, customerId, treatmentIds);

    public Task AddTreatmentAsync(int bookingId, int customerId, int treatmentId) =>
        repo.AddTreatmentAsync(bookingId, customerId, treatmentId);

    public async Task RemoveTreatmentAsync(int bookingId, int customerId, int treatmentId)
    {
        var freed = await repo.RemoveTreatmentAsync(bookingId, customerId, treatmentId);
        if (freed is not null)
            await InvalidateAndNotifyAsync(freed.LocationId, DateOnly.FromDateTime(freed.WorkDate));
    }

    public async Task<DateTime> ScheduleTreatmentAsync(
        int bookingId, int customerId, int treatmentId, int roomId, int therapistId, DateTime start, DateTime end)
    {
        var (expiresAt, locationId) = await repo.ScheduleTreatmentAsync(bookingId, customerId, treatmentId, roomId, therapistId, start, end);
        await InvalidateAndNotifyAsync(locationId, DateOnly.FromDateTime(start));
        return expiresAt;
    }

    public Task<BookingDetailsDto?> GetByIdAsync(int bookingId, int customerId) => repo.GetByIdAsync(bookingId, customerId);

    public async Task ConfirmAsync(int bookingId, int customerId)
    {
        var affected = await repo.ConfirmAsync(bookingId, customerId);
        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            await InvalidateAndNotifyAsync(group.LocationId, group.WorkDate);

        // Enqueue-only: this must stay fast (no SMTP I/O on the confirm request path) -- actual
        // sending happens on EmailQueueBackgroundService. Details is a fresh read rather than
        // something threaded through ConfirmAsync's return value because sp_Booking_Confirm's
        // shape is deliberately lean (just enough for cache invalidation); the email needs
        // names and each treatment's own therapist/time that read never carried.
        var details = await repo.GetConfirmationDetailsAsync(bookingId);
        if (details is not null)
            emailQueue.Enqueue(BuildConfirmationEmail(details));
    }

    private static EmailMessage BuildConfirmationEmail(ConfirmationDetailsDto details)
    {
        var appointmentNumber = details.Id.ToString("D6", CultureInfo.InvariantCulture);

        // Plain decimal, no currency symbol -- matches how prices are already shown everywhere
        // else in the app (e.g. TreatmentsPage.tsx's toFixed(2)); nothing in this app configures
        // a currency/locale, so "C" formatting would print an ambiguous generic currency sign.
        // Each treatment gets its own row (name, time, therapist, price) since they're scheduled
        // independently and may run at different times with different therapists.
        var treatmentRows = new StringBuilder();
        foreach (var t in details.Treatments)
        {
            var when = t.StartTime.ToString("dddd, dd MMMM yyyy 'at' HH:mm", CultureInfo.InvariantCulture);
            treatmentRows.Append(CultureInfo.InvariantCulture,
                $"<li>{t.TreatmentName} &mdash; {when} with {t.TherapistName} &mdash; {t.Price:F2}</li>");
        }

        var html = $"""
            <p>Hi {details.CustomerName},</p>
            <p>Your appointment is confirmed.</p>
            <p><strong>Appointment number: APT-{appointmentNumber}</strong></p>
            <ul>
              <li><strong>Location:</strong> {details.LocationName}</li>
            </ul>
            <p><strong>Treatments:</strong></p>
            <ul>{treatmentRows}</ul>
            <p>See you then!</p>
            """;

        return new EmailMessage(
            To: [new EmailAddress(details.CustomerEmail, details.CustomerName)],
            Subject: $"Appointment confirmed - APT-{appointmentNumber}",
            HtmlBody: html);
    }

    public async Task CancelAsync(int bookingId, int customerId)
    {
        var affected = await repo.CancelAsync(bookingId, customerId);
        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            await InvalidateAndNotifyAsync(group.LocationId, group.WorkDate);
    }

    public Task<IReadOnlyList<MyBookingDto>> GetMineAsync(int customerId) => repo.GetMineAsync(customerId);

    public async Task SweepExpiredHoldsAsync()
    {
        var affected = await repo.ExpireStaleHoldsAsync();
        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            await InvalidateAndNotifyAsync(group.LocationId, group.WorkDate);
    }

    private async Task InvalidateAndNotifyAsync(int locationId, DateOnly date)
    {
        await cache.InvalidateAsync(locationId, date);
        sse.Publish(SseBroadcaster.Group(locationId, date), "slot-changed");
    }
}
