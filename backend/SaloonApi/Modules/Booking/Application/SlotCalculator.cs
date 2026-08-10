namespace SaloonApi.Modules.Booking.Application;

internal sealed record EligiblePair(int RoomId, int TherapistId, TimeSpan ShiftStart, TimeSpan ShiftEnd);
internal sealed record ExistingBooking(int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime, bool IsHeld = false);
internal sealed record BlockedRange(int RoomId, DateTime StartTime, DateTime EndTime);
internal sealed record AvailableSlot(DateTime StartTime, DateTime EndTime, int RoomId, int TherapistId, bool IsHeld = false);

// Pure function: the one non-trivial algorithm in the booking flow, kept out of T-SQL so it's
// unit-testable. SQL Server only supplies the raw data (hours, eligible room/therapist pairs,
// existing bookings); this walks 15-minute candidate start times and filters out conflicts.
// Internal, exercised directly from SaloonApi.Tests via [assembly: InternalsVisibleTo].
internal static class SlotCalculator
{
    public static IReadOnlyList<AvailableSlot> ComputeAvailableSlots(
        DateOnly date,
        TimeSpan locationOpen,
        TimeSpan locationClose,
        int totalDurationSlots,
        IReadOnlyList<EligiblePair> eligiblePairs,
        IReadOnlyList<ExistingBooking> existingBookings,
        IReadOnlyList<BlockedRange>? blockedRanges = null,
        int slotMinutes = 15,
        TimeSpan? breakStart = null,
        TimeSpan? breakEnd = null)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        if (date < today || totalDurationSlots <= 0) return [];

        var duration = TimeSpan.FromMinutes(totalDurationSlots * slotMinutes);
        var results = new List<AvailableSlot>();
        var seenStartTimes = new HashSet<DateTime>();
        var now = DateTime.Now;

        foreach (var pair in eligiblePairs)
        {
            var windowStart = Max(locationOpen, pair.ShiftStart);
            var windowEnd = Min(locationClose, pair.ShiftEnd);
            if (windowEnd - windowStart < duration) continue;

            var cursor = date.ToDateTime(TimeOnly.FromTimeSpan(windowStart));
            var latestStart = date.ToDateTime(TimeOnly.FromTimeSpan(windowEnd)) - duration;

            while (cursor <= latestStart)
            {
                if (cursor <= now)
                {
                    cursor = cursor.AddMinutes(slotMinutes);
                    continue;
                }

                var slotEnd = cursor + duration;

                // A confirmed booking is a hard conflict and drops the slot entirely. A held (but
                // not yet confirmed) booking is temporary, so surface the slot anyway, flagged so
                // the client can disable rather than hide it -- it's someone else's in-progress
                // checkout, not a permanent unavailability.
                var hardConflict = false;
                var held = false;
                foreach (var b in existingBookings)
                {
                    if ((b.RoomId != pair.RoomId && b.TherapistId != pair.TherapistId) ||
                        b.StartTime >= slotEnd || b.EndTime <= cursor)
                        continue;

                    if (!b.IsHeld) { hardConflict = true; break; }
                    held = true;
                }

                // An admin-blocked range (lunch break, therapist leave, etc) is room-scoped, not
                // therapist-scoped, and always a hard conflict -- unlike a held booking, it's not
                // someone else's in-progress checkout that might expire, so the slot just disappears.
                if (!hardConflict && blockedRanges is not null)
                {
                    foreach (var block in blockedRanges)
                    {
                        if (block.RoomId != pair.RoomId || block.StartTime >= slotEnd || block.EndTime <= cursor)
                            continue;
                        hardConflict = true;
                        break;
                    }
                }

                // Recurring saloon-level break interval (e.g. lunch break 13:00 - 14:00) applies across all rooms
                if (!hardConflict && breakStart is not null && breakEnd is not null)
                {
                    var breakStartDt = date.ToDateTime(TimeOnly.FromTimeSpan(breakStart.Value));
                    var breakEndDt = date.ToDateTime(TimeOnly.FromTimeSpan(breakEnd.Value));
                    if (cursor < breakEndDt && slotEnd > breakStartDt)
                    {
                        hardConflict = true;
                    }
                }

                if (!hardConflict && seenStartTimes.Add(cursor))
                    results.Add(new AvailableSlot(cursor, slotEnd, pair.RoomId, pair.TherapistId, held));

                cursor = cursor.AddMinutes(slotMinutes);
            }
        }

        return results.OrderBy(r => r.StartTime).ToList();
    }

    private static TimeSpan Max(TimeSpan a, TimeSpan b) => a > b ? a : b;
    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;
}
