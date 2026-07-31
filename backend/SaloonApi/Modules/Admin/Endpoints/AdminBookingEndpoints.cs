using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminBookingEndpoints
{
    public static void MapAdminBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/bookings");

        // Therapists can see their own location's schedule too, not just Admin/Manager.
        group.MapGet("", async (int locationId, DateOnly date, BookingRepository repo) =>
            Results.Ok(await repo.GetForLocationAsync(locationId, date)))
            .RequireAuthorization("StaffAccess");

        group.MapPost("/{id:int}/cancel", async (int id, BookingRepository repo, IAvailabilityCache cache, SseBroadcaster sse) =>
        {
            var r = await repo.CancelAsAdminAsync(id);
            var workDate = DateOnly.FromDateTime(r.WorkDate);
            await cache.InvalidateAsync(r.LocationId, workDate);
            sse.Publish(SseBroadcaster.Group(r.LocationId, workDate), "slot-changed");
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess");
    }
}
