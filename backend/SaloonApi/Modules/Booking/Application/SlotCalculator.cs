namespace SaloonApi.Modules.Booking.Application;

public sealed record EligiblePair(int RoomId, int TherapistId, TimeSpan ShiftStart, TimeSpan ShiftEnd);
public sealed record ExistingBooking(int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime);
public sealed record AvailableSlot(DateTime StartTime, DateTime EndTime, int RoomId, int TherapistId);

// Pure function: the one non-trivial algorithm in the booking flow, kept out of T-SQL so it's
// unit-testable. SQL Server only supplies the raw data (hours, eligible room/therapist pairs,
// existing bookings); this walks 5-minute candidate start times and filters out conflicts.
public static class SlotCalculator
{
    public static IReadOnlyList<AvailableSlot> ComputeAvailableSlots(
        DateOnly date,
        TimeSpan locationOpen,
        TimeSpan locationClose,
        int totalDurationSlots,
        IReadOnlyList<EligiblePair> eligiblePairs,
        IReadOnlyList<ExistingBooking> existingBookings,
        int slotMinutes = 5)
    {
        if (totalDurationSlots <= 0) return [];

        var duration = TimeSpan.FromMinutes(totalDurationSlots * slotMinutes);
        var results = new List<AvailableSlot>();
        var seenStartTimes = new HashSet<DateTime>();

        foreach (var pair in eligiblePairs)
        {
            var windowStart = Max(locationOpen, pair.ShiftStart);
            var windowEnd = Min(locationClose, pair.ShiftEnd);
            if (windowEnd - windowStart < duration) continue;

            var cursor = date.ToDateTime(TimeOnly.FromTimeSpan(windowStart));
            var latestStart = date.ToDateTime(TimeOnly.FromTimeSpan(windowEnd)) - duration;

            while (cursor <= latestStart)
            {
                var slotEnd = cursor + duration;
                var conflict = existingBookings.Any(b =>
                    (b.RoomId == pair.RoomId || b.TherapistId == pair.TherapistId) &&
                    b.StartTime < slotEnd && b.EndTime > cursor);

                if (!conflict && seenStartTimes.Add(cursor))
                    results.Add(new AvailableSlot(cursor, slotEnd, pair.RoomId, pair.TherapistId));

                cursor = cursor.AddMinutes(slotMinutes);
            }
        }

        return results.OrderBy(r => r.StartTime).ToList();
    }

    private static TimeSpan Max(TimeSpan a, TimeSpan b) => a > b ? a : b;
    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;
}
