using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Modules.Payment.Infrastructure;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Booking.Application;

internal sealed class BookingService(
    BookingRepository repo,
    CatalogRepository catalog,
    IAvailabilityCache cache,
    SseBroadcaster sse,
    IBackgroundEmailQueue emailQueue,
    PaymentRepository paymentRepo,
    IPaymentGatewayFactory paymentGatewayFactory,
    IServiceScopeFactory scopeFactory,
    ILogger<BookingService> logger)
{
    public async Task<IReadOnlyList<DateOnly>> GetAvailableDatesAsync(
        int locationId, DateOnly from, DateOnly to, IReadOnlyList<int>? treatmentIds = null, int? excludeBookingId = null)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        if (from < today) from = today;
        if (to < from) return [];

        var cached = await cache.GetDatesAsync(locationId, treatmentIds);
        if (cached is not null)
        {
            var cachedDates = JsonSerializer.Deserialize<List<DateOnly>>(cached)!;
            return cachedDates.Where(d => d >= from && d <= to).ToList();
        }

        // Query date range tasks in parallel to minimize latency on cache misses
        var holidaysTask = catalog.GetHolidayDatesAsync(locationId, from, to);
        var hasRoomOpeningsTask = repo.HasLocationRoomOpeningsAsync(locationId);
        var openDatesTask = repo.GetLocationOpenDatesAsync(locationId, from, to);
        var rangeDataTask = repo.GetAvailabilityDataRangeAsync(locationId, treatmentIds ?? [], from, to, excludeBookingId);

        await Task.WhenAll(holidaysTask, hasRoomOpeningsTask, openDatesTask, rangeDataTask);

        var holidays = (await holidaysTask).ToHashSet();
        var hasRoomOpenings = await hasRoomOpeningsTask;
        var openDates = hasRoomOpenings ? await openDatesTask : null;
        var rangeData = await rangeDataTask;

        if (rangeData.Location is null) return [];

        var mask = (rangeData.Location.WorkingDaysMask == 0) ? (byte)127 : rangeData.Location.WorkingDaysMask;
        var hoursByDate = rangeData.DayHours.ToDictionary(h => h.WorkDate, h => (h.OpenTime, h.CloseTime));

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

        if (treatmentIds is not { Count: > 0 } || candidates.Count == 0)
        {
            if (excludeBookingId is null)
            {
                await cache.SetDatesAsync(locationId, treatmentIds, JsonSerializer.Serialize(candidates), TimeSpan.FromMinutes(60));
            }
            return candidates;
        }

        if (rangeData.Treatments.Count == 0) return [];

        var pairsByDate = rangeData.EligiblePairs
            .GroupBy(p => p.WorkDate)
            .ToDictionary(g => g.Key, IReadOnlyList<EligiblePair> (g) =>
                [.. g.Select(p => new EligiblePair(p.RoomId, p.TherapistId, p.ShiftStart, p.ShiftEnd))]);

        var bookingsByDate = rangeData.ExistingBookings
            .GroupBy(b => DateOnly.FromDateTime(b.StartTime))
            .ToDictionary(g => g.Key, IReadOnlyList<ExistingBooking> (g) =>
                [.. g.Select(b => new ExistingBooking(b.RoomId, b.TherapistId, b.StartTime, b.EndTime, b.Status == "Draft"))]);

        var blockedByDate = rangeData.BlockedRanges
            .GroupBy(b => b.WorkDate)
            .ToDictionary(g => g.Key, IReadOnlyList<BlockedRange> (g) =>
                [.. g.Select(b => new BlockedRange(b.RoomId, b.WorkDate.ToDateTime(TimeOnly.FromTimeSpan(b.StartTime)), b.WorkDate.ToDateTime(TimeOnly.FromTimeSpan(b.EndTime))))]);

        var availableDates = new List<DateOnly>();
        foreach (var d in candidates)
        {
            var pairs = pairsByDate.GetValueOrDefault(d, []);
            var bookings = bookingsByDate.GetValueOrDefault(d, []);
            var blocked = blockedByDate.GetValueOrDefault(d, []);

            if (!hoursByDate.TryGetValue(d, out var hours)) continue;

            var allTreatmentsHaveSlot = true;
            foreach (var treatment in rangeData.Treatments)
            {
                var slots = SlotCalculator.ComputeAvailableSlots(
                    d, hours.OpenTime, hours.CloseTime, treatment.DurationSlots, pairs, bookings, blocked,
                    breakStart: rangeData.Location.BreakStartTime, breakEnd: rangeData.Location.BreakEndTime);

                if (slots.Count == 0)
                {
                    allTreatmentsHaveSlot = false;
                    break;
                }
            }

            if (allTreatmentsHaveSlot)
            {
                availableDates.Add(d);
            }
        }

        if (excludeBookingId is null)
        {
            await cache.SetDatesAsync(locationId, treatmentIds, JsonSerializer.Serialize(availableDates), TimeSpan.FromMinutes(60));
        }

        return availableDates;
    }

    public async Task<IReadOnlyList<AvailableSlot>> GetAvailableSlotsAsync(int locationId, IReadOnlyList<int> treatmentIds, DateOnly date, int? excludeBookingId = null)
    {
        if (excludeBookingId is null)
        {
            var cached = await cache.GetAsync(locationId, date, treatmentIds);
            if (cached is not null)
                return JsonSerializer.Deserialize<List<AvailableSlot>>(cached)!;
        }

        var dataTask = repo.GetAvailabilityDataAsync(locationId, treatmentIds, date, excludeBookingId);
        var hasRoomOpeningsTask = repo.HasLocationRoomOpeningsAsync(locationId);
        await Task.WhenAll(dataTask, hasRoomOpeningsTask);
        var data = await dataTask;
        if (data.Location is null || data.Location.IsHoliday) return [];

        // A location that hasn't adopted room-category-assignment scheduling is gated purely by its
        // weekly WorkingDaysMask -- same rule GetAvailableDatesAsync uses to build the date picker
        // (see its isDayMaskAllowed check). Without this, a day the mask says is closed could still
        // return slots here even though the date picker never offered it. A location that HAS
        // adopted RCA scheduling doesn't need this check: an ineligible day already yields zero
        // EligiblePairs below (see sp_Booking_GetAvailabilityData's EligibleShifts).
        if (!await hasRoomOpeningsTask)
        {
            var mask = data.Location.WorkingDaysMask == 0 ? (byte)127 : data.Location.WorkingDaysMask;
            var dayBit = ((int)date.DayOfWeek + 6) % 7;
            if ((mask & (1 << dayBit)) == 0) return [];
        }

        var totalSlots = data.Treatments.Sum(t => t.DurationSlots);
        var pairs = data.EligiblePairs.Select(p => new EligiblePair(p.RoomId, p.TherapistId, p.ShiftStart, p.ShiftEnd)).ToList();
        var existing = data.ExistingBookings.Select(b => new ExistingBooking(b.RoomId, b.TherapistId, b.StartTime, b.EndTime, b.Status == "Draft")).ToList();
        var blocked = data.BlockedRanges.Select(b =>
            new BlockedRange(b.RoomId, date.ToDateTime(TimeOnly.FromTimeSpan(b.StartTime)), date.ToDateTime(TimeOnly.FromTimeSpan(b.EndTime)))).ToList();

        var slots = SlotCalculator.ComputeAvailableSlots(
            date, data.Location.OpenTime, data.Location.CloseTime, totalSlots, pairs, existing, blocked,
            breakStart: data.Location.BreakStartTime, breakEnd: data.Location.BreakEndTime);

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
            _ = SyncAndNotifyAsync(freed.LocationId, DateOnly.FromDateTime(freed.WorkDate));
    }

    public async Task<DateTime> ScheduleTreatmentAsync(
        int bookingId, int customerId, int treatmentId, int roomId, int therapistId, DateTime start, DateTime end)
    {
        var (expiresAt, locationId) = await repo.ScheduleTreatmentAsync(bookingId, customerId, treatmentId, roomId, therapistId, start, end);
        _ = SyncAndNotifyAsync(locationId, DateOnly.FromDateTime(start));
        return expiresAt;
    }

    // Admin calendar drag-to-reschedule -- moves a Confirmed booking's treatment, not a Draft hold.
    // See sp_Booking_RescheduleConfirmed for why this can't reuse ScheduleTreatmentAsync above.
    public async Task RescheduleConfirmedAsync(int bookingId, int treatmentId, int roomId, int therapistId, DateTime start, DateTime end)
    {
        var locationId = await repo.RescheduleConfirmedAsync(bookingId, treatmentId, roomId, therapistId, start, end);
        _ = SyncAndNotifyAsync(locationId, DateOnly.FromDateTime(start));
    }

    public async Task ReassignTherapistAsync(int bookingId, int treatmentId, int newTherapistId, string? reason)
    {
        var locationId = await repo.ReassignTherapistAsync(bookingId, treatmentId, newTherapistId, reason);
        _ = SyncAndNotifyAsync(locationId, DateOnly.FromDateTime(DateTime.UtcNow));
    }

    public Task<BookingDetailsDto?> GetByIdAsync(int bookingId, int customerId) => repo.GetByIdAsync(bookingId, customerId);

    public async Task ConfirmAsync(int bookingId, int customerId = 0)
    {
        var affected = await repo.ConfirmAsync(bookingId, customerId);
        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            _ = SyncAndNotifyAsync(group.LocationId, group.WorkDate);

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
                var location = await catalog.GetLocationByIdForAdminAsync(booking.LocationId);
                if (IsWithinCancellationWindow(earliest, location?.TimeZoneId, DateTime.UtcNow))
                {
                    throw new InvalidOperationException("Bookings cannot be cancelled within 48 hours (2 days) of the appointment date.");
                }
            }
        }

        var affected = await repo.CancelAsync(bookingId, customerId);

        await RefundSucceededPaymentsAsync(bookingId, "Automated refund: Booking cancelled >48h prior to appointment");

        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            _ = SyncAndNotifyAsync(group.LocationId, group.WorkDate);

        if (details is not null)
            emailQueue.Enqueue(BuildCancellationEmail(details));
    }

    /// <summary>
    /// True if venueLocalEarliestStart falls within the 48h cancellation cutoff. StartTime is
    /// venue-local wall-clock (see BookingRepository.ScheduleTreatmentAsync comment) -- comparing
    /// it straight against UTC "now" silently shifts the cutoff by the venue's UTC offset, so this
    /// resolves the venue's timezone before comparing. Pure/no I-O so it's directly unit-testable,
    /// same reasoning as ResolveChargeAmount above.
    /// </summary>
    internal static bool IsWithinCancellationWindow(DateTime venueLocalEarliestStart, string? timeZoneId, DateTime utcNow, int windowDays = 2)
    {
        var tz = TryGetTimeZone(timeZoneId);
        var earliestUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(venueLocalEarliestStart, DateTimeKind.Unspecified), tz);
        return earliestUtc <= utcNow.AddDays(windowDays);
    }

    private static TimeZoneInfo TryGetTimeZone(string? timeZoneId)
    {
        if (string.IsNullOrEmpty(timeZoneId)) return TimeZoneInfo.Utc;
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.Utc;
        }
        catch (InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }

    private async Task RefundSucceededPaymentsAsync(int bookingId, string reason)
    {
        var payments = await paymentRepo.GetByBookingIdAsync(bookingId);
        foreach (var p in payments.Where(p => p.Status.Equals("Succeeded", StringComparison.OrdinalIgnoreCase)))
        {
            if (!Enum.TryParse<PaymentProvider>(p.Provider, out var provider))
            {
                provider = PaymentProvider.Cash;
            }

            var gateway = paymentGatewayFactory.GetGateway(provider);
            var result = await gateway.RefundAsync(p.TransactionId, p.Amount + p.TipAmount, reason);

            if (result.Success)
            {
                await paymentRepo.UpdateStatusAsync(p.Id, "Refunded", p.TransactionId, failureReason: reason);
            }
            else
            {
                logger.LogError(
                    "Refund failed for payment {PaymentId} on booking {BookingId}: {Error}",
                    p.Id, bookingId, result.ErrorMessage);
                await paymentRepo.UpdateStatusAsync(
                    p.Id, p.Status, p.TransactionId,
                    failureReason: $"Refund attempt failed, needs manual follow-up: {result.ErrorMessage}");
            }
        }
    }

    public async Task CancelAsAdminAsync(int bookingId, int? cancelReasonId = null)
    {
        var details = await repo.GetConfirmationDetailsAsync(bookingId);

        var affected = await repo.CancelAsAdminAsync(bookingId, cancelReasonId);

        await RefundSucceededPaymentsAsync(bookingId, "Automated refund: Booking cancelled by admin");

        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            _ = SyncAndNotifyAsync(group.LocationId, group.WorkDate);

        if (details is not null)
            emailQueue.Enqueue(BuildCancellationEmail(details));
    }

    public Task<IReadOnlyList<MyBookingDto>> GetMineAsync(int customerId, int? chainId = null, int? locationId = null) =>
        repo.GetMineAsync(customerId, chainId, locationId);

    // No refund/email here -- a no-show forfeits whatever was already paid (unlike a cancellation,
    // there's no automatic refund to process), and it's a back-office record correction, not
    // something the customer needs notified about.
    public Task MarkNoShowAsync(int bookingId) => repo.MarkNoShowAsync(bookingId);

    public async Task SweepExpiredHoldsAsync()
    {
        var affected = await repo.ExpireStaleHoldsAsync();
        foreach (var group in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            _ = SyncAndNotifyAsync(group.LocationId, group.WorkDate);
    }

    public async Task SyncAndNotifyAsync(int locationId, DateOnly date)
    {
        await cache.InvalidateAsync(locationId, date);
        sse.Publish(locationId, date, "slot-changed");

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var bookingService = scope.ServiceProvider.GetRequiredService<BookingService>();
                await bookingService.WarmAvailabilityAsync(locationId, date);
            }
#pragma warning disable CA1031
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Background Redis availability sync failed for location {LocationId}, date {Date}", locationId, date);
            }
#pragma warning restore CA1031
        });
    }

    // Pre-warms the availability cache for one location/date: the date-range cache plus one
    // slots-cache entry per treatment (each treatment has its own eligible room/therapist set, so
    // this can't collapse into a single DB round trip without reshaping the stored proc). Bounded
    // concurrency instead of full sequential awaits -- a location with dozens of treatments no
    // longer serializes dozens of DB round trips one at a time, and the cap keeps a single call
    // from opening dozens of connections at once. Shared by the fire-and-forget mutation-triggered
    // sync above and the startup pre-sync (AvailabilitySyncStartupHostedService), which awaits this
    // directly per venue with its own bounded fan-out across venues.
    public async Task WarmAvailabilityAsync(int locationId, DateOnly date)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        var to = today.AddDays(90);

        await GetAvailableDatesAsync(locationId, today, to);

        var treatments = await catalog.GetTreatmentsAsync(locationId, null);
        await Parallel.ForEachAsync(treatments, new ParallelOptions { MaxDegreeOfParallelism = 4 },
            async (t, _) => await GetAvailableSlotsAsync(locationId, [t.Id], date));
    }
}
