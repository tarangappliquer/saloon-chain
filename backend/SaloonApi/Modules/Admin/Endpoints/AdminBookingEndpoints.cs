using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminBookingEndpoints
{
    public static void MapAdminBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/bookings").WithTags("Admin Bookings");

        // Therapists can see their own location's schedule too, not just Admin/Manager -- but
        // StaffAccess only checks role membership, not *which* location, so Manager/Therapist
        // scoping (dbo.Users.LocationId) has to be enforced here or either role could read another
        // location's bookings -- including customer name/email -- just by changing locationId.
        group.MapGet("", async (int locationId, DateOnly date, BookingRepository repo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Therapist) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetForLocationAsync(locationId, date));
        }).RequireAuthorization("StaffAccess")
          .Produces<IReadOnlyList<AdminBookingDto>>()
          .ProducesProblem(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's bookings for a given date.");

        group.MapPost("/{id:int}/cancel", async (int id, BookingRepository repo, IAvailabilityCache cache, SseBroadcaster sse) =>
        {
            var affected = await repo.CancelAsAdminAsync(id);
            foreach (var slot in affected.Select(a => (a.LocationId, WorkDate: DateOnly.FromDateTime(a.WorkDate))).Distinct())
            {
                await cache.InvalidateAsync(slot.LocationId, slot.WorkDate);
                sse.Publish(SseBroadcaster.Group(slot.LocationId, slot.WorkDate), "slot-changed");
            }
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess")
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Cancel a customer's booking on their behalf and free its slot.");
    }
}
