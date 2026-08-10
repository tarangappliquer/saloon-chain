using SaloonApi.Modules.Booking.Application;
using Xunit;

namespace SaloonApi.Tests;

public class SlotCalculatorTests
{
    private static readonly DateOnly Date = DateOnly.FromDateTime(DateTime.Now).AddDays(7);

    [Fact]
    public void LastSlotThatExactlyFitsBeforeClosingIsIncluded()
    {
        var pairs = new[] { new EligiblePair(RoomId: 1, TherapistId: 1, TimeSpan.FromHours(9), TimeSpan.FromHours(10)) };
        // 2 slots = 30 min (2 * 15m), window is 60 min -> last valid start is 09:30
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, []);

        Assert.Contains(slots, s => s.StartTime == Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))));
        Assert.DoesNotContain(slots, s => s.StartTime > Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))));
    }

    [Fact]
    public void DurationLongerThanShiftWindowProducesNoSlots()
    {
        var pairs = new[] { new EligiblePair(1, 1, TimeSpan.FromHours(9), TimeSpan.FromHours(9.25)) }; // 15 min shift
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, []); // needs 30 min

        Assert.Empty(slots);
    }

    [Fact]
    public void MultiTreatmentDurationSumsBeforeComputingSlots()
    {
        var pairs = new[] { new EligiblePair(1, 1, TimeSpan.FromHours(9), TimeSpan.FromHours(9.5)) }; // 30 min shift
        // two treatments totalling 2 slots (30 min) should fit exactly once, at 09:00
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, []);

        var expected = new AvailableSlot(Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9))),
                                          Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))), 1, 1);
        Assert.Single(slots, s => s == expected);
    }

    [Fact]
    public void ExistingBookingOnSameRoomExcludesOverlappingStartTimes()
    {
        var pairs = new[] { new EligiblePair(1, 1, TimeSpan.FromHours(9), TimeSpan.FromHours(10)) };
        var existing = new[]
        {
            new ExistingBooking(RoomId: 1, TherapistId: 1,
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.25))),
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))))
        };
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, existing);

        Assert.DoesNotContain(slots, s =>
            s.StartTime < Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))) &&
            s.EndTime > Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.25))));
    }

    [Fact]
    public void ExistingBookingOnSameTherapistDifferentRoomStillExcludesSlot()
    {
        // same therapist double-booked across two rooms must still be rejected
        var pairs = new[] { new EligiblePair(RoomId: 2, TherapistId: 1, TimeSpan.FromHours(9), TimeSpan.FromHours(10)) };
        var existing = new[]
        {
            new ExistingBooking(RoomId: 1, TherapistId: 1,
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9))),
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))))
        };
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, existing);

        Assert.DoesNotContain(slots, s => s.StartTime == Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9))));
    }

    [Fact]
    public void NoEligiblePairsProducesNoSlots()
    {
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, [], []);
        Assert.Empty(slots);
    }

    [Fact]
    public void HeldBookingSurfacesSlotFlaggedInsteadOfExcludingIt()
    {
        var pairs = new[] { new EligiblePair(1, 1, TimeSpan.FromHours(9), TimeSpan.FromHours(10)) };
        var existing = new[]
        {
            new ExistingBooking(RoomId: 1, TherapistId: 1,
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9))),
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))), IsHeld: true)
        };
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, existing);

        var slot = Assert.Single(slots, s => s.StartTime == Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9))));
        Assert.True(slot.IsHeld);
    }

    [Fact]
    public void BlockedRangeExcludesOverlappingStartTimesUnconditionally()
    {
        var pairs = new[] { new EligiblePair(1, 1, TimeSpan.FromHours(9), TimeSpan.FromHours(10)) };
        var blocked = new[]
        {
            new BlockedRange(RoomId: 1,
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.25))),
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))))
        };
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, [], blocked);

        Assert.DoesNotContain(slots, s =>
            s.StartTime < Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))) &&
            s.EndTime > Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.25))));
    }

    [Fact]
    public void BlockedRangeOnDifferentRoomDoesNotAffectSlot()
    {
        var pairs = new[] { new EligiblePair(RoomId: 2, TherapistId: 1, TimeSpan.FromHours(9), TimeSpan.FromHours(10)) };
        var blocked = new[]
        {
            new BlockedRange(RoomId: 1,
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9))),
                Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9.5))))
        };
        var slots = SlotCalculator.ComputeAvailableSlots(Date, TimeSpan.FromHours(9), TimeSpan.FromHours(18), totalDurationSlots: 2, pairs, [], blocked);

        Assert.Contains(slots, s => s.StartTime == Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(9))));
    }

    [Fact]
    public void SaloonBreakIntervalExcludesOverlappingSlots()
    {
        var pairs = new[] { new EligiblePair(1, 1, TimeSpan.FromHours(9), TimeSpan.FromHours(17)) };
        var slots = SlotCalculator.ComputeAvailableSlots(
            Date, TimeSpan.FromHours(9), TimeSpan.FromHours(17), totalDurationSlots: 2, pairs, [],
            breakStart: TimeSpan.FromHours(13), breakEnd: TimeSpan.FromHours(14));

        var break1300 = Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(13)));
        var break1330 = Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(13.5)));

        Assert.DoesNotContain(slots, s => s.StartTime == break1300 || s.StartTime == break1330);
        Assert.Contains(slots, s => s.StartTime == Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(12.5))));
        Assert.Contains(slots, s => s.StartTime == Date.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(14.0))));
    }
}
