using System.Security.Claims;
using Microsoft.Data.SqlClient;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Booking.Endpoints;

public static class BookingEndpoints
{
    public static void MapBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/booking").RequireAuthorization();

        group.MapGet("/available-dates", async (int locationId, DateOnly from, DateOnly to, BookingService svc) =>
            Results.Ok(await svc.GetAvailableDatesAsync(locationId, from, to)));

        group.MapGet("/available-slots", async (int locationId, string treatmentIds, DateOnly date, BookingService svc) =>
        {
            var ids = treatmentIds.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToList();
            return Results.Ok(await svc.GetAvailableSlotsAsync(locationId, ids, date));
        });

        group.MapPost("/hold", async (HoldRequest req, ClaimsPrincipal user, BookingService svc) =>
        {
            try
            {
                var customerId = user.GetCustomerId();
                var (bookingId, expiresAt) = await svc.HoldAsync(
                    req.LocationId, req.RoomId, req.TherapistId, customerId, req.StartTime, req.EndTime, req.TreatmentIds);
                return Results.Ok(new HoldResponse(bookingId, expiresAt));
            }
            catch (SqlException ex) when (ex.IsApplicationError())
            {
                return Results.Conflict(new { message = ex.Message });
            }
        });

        group.MapPost("/{id:int}/confirm", async (int id, ClaimsPrincipal user, BookingService svc) =>
        {
            try
            {
                await svc.ConfirmAsync(id, user.GetCustomerId());
                return Results.NoContent();
            }
            catch (SqlException ex) when (ex.IsApplicationError())
            {
                return Results.Conflict(new { message = ex.Message });
            }
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, BookingService svc) =>
        {
            try
            {
                await svc.CancelAsync(id, user.GetCustomerId());
                return Results.NoContent();
            }
            catch (SqlException ex) when (ex.IsApplicationError())
            {
                return Results.Conflict(new { message = ex.Message });
            }
        });

        group.MapGet("/mine", async (ClaimsPrincipal user, BookingService svc) =>
            Results.Ok(await svc.GetMineAsync(user.GetCustomerId())));

        // Anonymous: the event carries no customer data, just "something changed for this
        // location+date, refetch" -- and EventSource can't send an Authorization header anyway.
        app.MapGet("/api/booking/stream", async (int locationId, DateOnly date, HttpContext ctx, SseBroadcaster sse, CancellationToken ct) =>
        {
            ctx.Response.Headers.ContentType = "text/event-stream";
            var (id, reader) = sse.Subscribe(SseBroadcaster.Group(locationId, date));
            try
            {
                await foreach (var message in reader.ReadAllAsync(ct))
                {
                    await ctx.Response.WriteAsync($"event: slot-changed\ndata: {message}\n\n", ct);
                    await ctx.Response.Body.FlushAsync(ct);
                }
            }
            finally
            {
                sse.Unsubscribe(id);
            }
        });
    }
}

public sealed record HoldRequest(
    int LocationId, int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime, List<int> TreatmentIds);

public sealed record HoldResponse(int BookingId, DateTime ExpiresAt);
