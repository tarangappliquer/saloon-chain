using System.Globalization;
using System.Text;
using System.Text.Json;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Payment.Infrastructure;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Booking.Application;

internal sealed class BookingService(
    BookingRepository repo, CatalogRepository catalog, IAvailabilityCache cache, SseBroadcaster sse, IBackgroundEmailQueue emailQueue, PaymentRepository paymentRepo)
{
    public async Task<IReadOnlyList<DateOnly>> GetAvailableDatesAsync(
        int locationId, DateOnly from, DateOnly to, IReadOnlyList<int>? treatmentIds = null, int? excludeBookingId = null)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        if (from < today) from = today;
        if (to < from) return [];

        var data = await repo.GetAvailabilityDataAsync(locationId, [], from);
        var mask = (data.Location?.WorkingDaysMask ?? 0) == 0 ? 127 : data.Location!.WorkingDaysMask;
        var holidays = (await catalog.GetHolidayDatesAsync(locationId, from, to)).ToHashSet();

        var hasRoomOpenings = await repo.HasLocationRoomOpeningsAsync(locationId);
        var openDates = hasRoomOpenings ? await repo.GetLocationOpenDatesAsync(locationId, from, to) : null;

        var candidates = new List<DateOnly>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var bit = ((int)d.DayOfWeek + 6) % 7; // Mon=bit0 .. Sun=bit6
            var isDayMaskAllowed = (mask & (1 << bit)) != 0;
            var isExplicitlyOpened = openDates != null && openDates.Contains(d);

            if ((!isDayMaskAllowed && !isExplicitlyOpened) || holidays.Contains(d)) continue;
            if (openDates != null && !openDates.Contains(d)) continue;

            candidates.Add(d);
        }

        if (treatmentIds is not { Count: > 0 } || candidates.Count == 0) return candidates;

        // A date only counts as available if EVERY requested treatment, checked separately, has its
        // own open slot that day (matches GetAvailableSlotsAsync being called once per treatment id --
        // see useBookingFlow.ts's loadSlots -- not once for the combined duration of all of them).
        // One range query per treatment covers every candidate day in a single round trip, instead of
        // one round trip per (day, treatment) pair -- a 90-day range x 2 treatments used to mean up to
        // 180 sequential DB calls; now it's 2, each spanning the whole range via
        // sp_Booking_GetAvailabilityDataRange.
        var rangeFrom = candidates[0];
        var rangeTo = candidates[^1];
        var perTreatmentAvailableDates = await Task.WhenAll(treatmentIds.Select(async tid =>
        {
            var data = await repo.GetAvailabilityDataRangeAsync(locationId, [tid], rangeFrom, rangeTo, excludeBookingId);
            var treatment = data.Treatments.FirstOrDefault(t => t.Id == tid);
            if (data.Location is null || treatment is null) return [];

            var pairsByDate = data.EligiblePairs
                .GroupBy(p => p.WorkDate)
                .ToDictionary(g => g.Key, IReadOnlyList<EligiblePair> (g) =>
                    [.. g.Select(p => new EligiblePair(p.RoomId, p.TherapistId, p.ShiftStart, p.ShiftEnd))]);
            var bookingsByDate = data.ExistingBookings
                .GroupBy(b => DateOnly.FromDateTime(b.StartTime))
                .ToDictionary(g => g.Key, IReadOnlyList<ExistingBooking> (g) =>
                    [.. g.Select(b => new ExistingBooking(b.RoomId, b.TherapistId, b.StartTime, b.EndTime, b.Status == "Draft"))]);

            var openDatesForTreatment = new HashSet<DateOnly>();
            foreach (var d in candidates)
            {
                var pairs = pairsByDate.GetValueOrDefault(d, []);
                var bookings = bookingsByDate.GetValueOrDefault(d, []);
                var slots = SlotCalculator.ComputeAvailableSlots(
                    d, data.Location.OpenTime, data.Location.CloseTime, treatment.DurationSlots, pairs, bookings);
                if (slots.Count > 0) openDatesForTreatment.Add(d);
            }
            return openDatesForTreatment;
        }));

        return candidates.Where(d => perTreatmentAvailableDates.All(set => set.Contains(d))).ToList();
    }

    public async Task<IReadOnlyList<AvailableSlot>> GetAvailableSlotsAsync(int locationId, IReadOnlyList<int> treatmentIds, DateOnly date, int? excludeBookingId = null)
    {
        if (excludeBookingId is null)
        {
            var cached = await cache.GetAsync(locationId, date, treatmentIds);
            if (cached is not null)
                return JsonSerializer.Deserialize<List<AvailableSlot>>(cached)!;
        }

        var data = await repo.GetAvailabilityDataAsync(locationId, treatmentIds, date, excludeBookingId);
        if (data.Location is null || data.Location.IsHoliday) return [];

        var totalSlots = data.Treatments.Sum(t => t.DurationSlots);
        var pairs = data.EligiblePairs.Select(p => new EligiblePair(p.RoomId, p.TherapistId, p.ShiftStart, p.ShiftEnd)).ToList();
        var existing = data.ExistingBookings.Select(b => new ExistingBooking(b.RoomId, b.TherapistId, b.StartTime, b.EndTime, b.Status == "Draft")).ToList();

        var slots = SlotCalculator.ComputeAvailableSlots(
            date, data.Location.OpenTime, data.Location.CloseTime, totalSlots, pairs, existing);

        if (excludeBookingId is null)
        {
            await cache.SetAsync(locationId, date, treatmentIds, JsonSerializer.Serialize(slots), TimeSpan.FromSeconds(60));
        }
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

        var details = await repo.GetConfirmationDetailsAsync(bookingId);
        if (details is not null)
            emailQueue.Enqueue(BuildConfirmationEmail(details));
    }

    private static EmailMessage BuildConfirmationEmail(ConfirmationDetailsDto details)
    {
        var appointmentNumber = details.Id.ToString("D6", CultureInfo.InvariantCulture);

        var treatmentRows = new StringBuilder();
        foreach (var t in details.Treatments)
        {
            var when = t.StartTime.ToString("dddd, dd MMMM yyyy 'at' HH:mm", CultureInfo.InvariantCulture);
            treatmentRows.Append(CultureInfo.InvariantCulture,
                $"<li>{t.TreatmentName} &mdash; {when} with {t.TherapistName} &mdash; ${t.Price:F2}</li>");
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

    private static EmailMessage BuildCancellationEmail(ConfirmationDetailsDto details)
    {
        var appointmentNumber = details.Id.ToString("D6", CultureInfo.InvariantCulture);

        var treatmentRows = new StringBuilder();
        foreach (var t in details.Treatments)
        {
            var when = t.StartTime.ToString("dddd, dd MMMM yyyy 'at' HH:mm", CultureInfo.InvariantCulture);
            treatmentRows.Append(CultureInfo.InvariantCulture,
                $"<li>{t.TreatmentName} &mdash; {when} with {t.TherapistName} &mdash; ${t.Price:F2}</li>");
        }

        var html = $"""
            <p>Hi {details.CustomerName},</p>
            <p>Your appointment has been cancelled.</p>
            <p><strong>Appointment number: APT-{appointmentNumber}</strong></p>
            <ul>
              <li><strong>Location:</strong> {details.LocationName}</li>
            </ul>
            <p><strong>Cancelled Treatments:</strong></p>
            <ul>{treatmentRows}</ul>
            <p>If you were charged, a full refund has been issued to your original payment method.</p>
            <p>If you have any questions, please contact our support team.</p>
            """;

        return new EmailMessage(
            To: [new EmailAddress(details.CustomerEmail, details.CustomerName)],
            Subject: $"Appointment cancelled - APT-{appointmentNumber}",
            HtmlBody: html);
    }

    public async Task CancelAsync(int bookingId, int customerId)
    {
        var details = await repo.GetConfirmationDetailsAsync(bookingId);

        var booking = await repo.GetByIdAsync(bookingId, customerId);
        if (booking is not null)
        {
            var scheduledTimes = booking.Treatments
                .Where(t => t.StartTime.HasValue)
                .Select(t => t.StartTime!.Value)
                .ToList();

            if (scheduledTimes.Count > 0)
            {
                var earliest = scheduledTimes.Min();
                // 2 days (48 hours) cancellation policy check
                if (earliest <= DateTime.UtcNow.AddDays(2))
                {
                    throw new InvalidOperationException("Bookings cannot be cancelled within 48 hours (2 days) of the appointment date.");
                }
            }
        }

        var affected = await repo.CancelAsync(bookingId, customerId);

        // Refund flow: Automatically process refund for any completed payments for this booking
        var payments = await paymentRepo.GetByBookingIdAsync(bookingId);
        foreach (var p in payments.Where(p => p.Status.Equals("Succeeded", StringComparison.OrdinalIgnoreCase) || p.Status.Equals("Paid", StringComparison.OrdinalIgnoreCase)))
        {
            await paymentRepo.UpdateStatusAsync(p.Id, "Refunded", p.TransactionId, failureReason: "Automated refund: Booking cancelled >48h prior to appointment");
        }

        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            await InvalidateAndNotifyAsync(group.LocationId, group.WorkDate);

        if (details is not null)
            emailQueue.Enqueue(BuildCancellationEmail(details));
    }

    public async Task CancelAsAdminAsync(int bookingId)
    {
        var details = await repo.GetConfirmationDetailsAsync(bookingId);

        var affected = await repo.CancelAsAdminAsync(bookingId);

        // Refund flow: Automatically process refund for any completed payments for this booking
        var payments = await paymentRepo.GetByBookingIdAsync(bookingId);
        foreach (var p in payments.Where(p => p.Status.Equals("Succeeded", StringComparison.OrdinalIgnoreCase) || p.Status.Equals("Paid", StringComparison.OrdinalIgnoreCase)))
        {
            await paymentRepo.UpdateStatusAsync(p.Id, "Refunded", p.TransactionId, failureReason: "Automated refund: Booking cancelled by admin");
        }

        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            await InvalidateAndNotifyAsync(group.LocationId, group.WorkDate);

        if (details is not null)
            emailQueue.Enqueue(BuildCancellationEmail(details));
    }

    public Task<IReadOnlyList<MyBookingDto>> GetMineAsync(int customerId, int? chainId = null) => repo.GetMineAsync(customerId, chainId);

    public async Task SweepExpiredHoldsAsync()
    {
        var affected = await repo.ExpireStaleHoldsAsync();
        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            await InvalidateAndNotifyAsync(group.LocationId, group.WorkDate);
    }

    private async Task InvalidateAndNotifyAsync(int locationId, DateOnly date)
    {
        await cache.InvalidateAsync(locationId, date);
        sse.Publish(locationId, date, "slot-changed");
    }
}
