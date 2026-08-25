using SaloonApi.Modules.Booking.Application;
using Xunit;

namespace SaloonApi.Tests;

public class CancellationWindowTests
{
    // Anchor "now" mid-day UTC so a +/- few-hour venue offset can't accidentally cross a day
    // boundary and change which case we're actually testing.
    private static readonly DateTime UtcNow = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void UtcVenueBlocksCancellationInsideWindow()
    {
        var start = UtcNow.AddDays(2).AddHours(-1); // 47h away
        Assert.True(BookingService.IsWithinCancellationWindow(start, "UTC", UtcNow));
    }

    [Fact]
    public void UtcVenueAllowsCancellationOutsideWindow()
    {
        var start = UtcNow.AddDays(2).AddHours(1); // 49h away
        Assert.False(BookingService.IsWithinCancellationWindow(start, "UTC", UtcNow));
    }

    [Fact]
    public void PositiveOffsetVenueDoesNotExtendTheWindow()
    {
        // Venue at UTC+10 (e.g. Australia/Sydney). Wall-clock start is 49h past UTC-now's clock
        // reading, but that wall-clock instant is only ~39h away once the +10 offset is applied
        // (49h - 10h), so it's still inside the 48h cutoff -- treating it as UTC would wrongly
        // allow the cancellation.
        var venueLocalStart = UtcNow.AddDays(2).AddHours(1);
        Assert.True(BookingService.IsWithinCancellationWindow(venueLocalStart, "Australia/Sydney", UtcNow));
    }

    [Fact]
    public void NegativeOffsetVenueDoesNotShrinkTheWindow()
    {
        // Venue at UTC-5 (e.g. America/New_York). Wall-clock start is 47h past UTC-now's clock
        // reading, but that instant is actually ~52h away once the -5 offset is applied
        // (47h + 5h), so it's outside the 48h cutoff -- treating it as UTC would wrongly block it.
        var venueLocalStart = UtcNow.AddDays(2).AddHours(-1);
        Assert.False(BookingService.IsWithinCancellationWindow(venueLocalStart, "America/New_York", UtcNow));
    }

    [Fact]
    public void MissingOrUnknownTimeZoneFallsBackToUtc()
    {
        var start = UtcNow.AddDays(2).AddHours(1);
        Assert.False(BookingService.IsWithinCancellationWindow(start, null, UtcNow));
        Assert.False(BookingService.IsWithinCancellationWindow(start, "Not/ARealZone", UtcNow));
    }
}
