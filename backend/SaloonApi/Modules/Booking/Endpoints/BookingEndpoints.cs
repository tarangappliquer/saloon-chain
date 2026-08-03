using FluentValidation;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Realtime;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Booking.Endpoints;

internal static class BookingEndpoints
{
    public static void MapBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/booking").RequireAuthorization().WithTags("Booking")
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        group.MapGet("/available-dates", async (int locationId, DateOnly from, DateOnly to, BookingService svc) =>
            Results.Ok(await svc.GetAvailableDatesAsync(locationId, from, to)))
            .Produces<IReadOnlyList<DateOnly>>()
            .WithDescription("List dates in range that have at least one open slot at a location.");

        group.MapGet("/available-slots", async (int locationId, string treatmentIds, DateOnly date, BookingService svc) =>
        {
            var parts = treatmentIds.Split(',', StringSplitOptions.RemoveEmptyEntries);
            var ids = new List<int>(parts.Length);
            foreach (var part in parts)
            {
                if (!int.TryParse(part, out var id))
                    return Results.Problem($"Invalid treatmentIds value '{part}'.", statusCode: StatusCodes.Status400BadRequest);
                ids.Add(id);
            }

            return Results.Ok(await svc.GetAvailableSlotsAsync(locationId, ids, date));
        }).Produces<IReadOnlyList<AvailableSlot>>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("List open time slots for a treatment combo at a location/date.");

        group.MapPost("/hold", async (HoldRequest req, ICurrentUser currentUser, BookingService svc) =>
        {
            var (bookingId, expiresAt) = await svc.HoldAsync(
                req.LocationId, req.RoomId, req.TherapistId, currentUser.RequireUserId(),
                req.StartTime, req.EndTime, req.TreatmentIds);
            return Results.Ok(new HoldResponse(bookingId, expiresAt));
        }).WithValidation<HoldRequest>()
          .Produces<HoldResponse>()
          .WithDescription("Temporarily hold a slot while the customer completes checkout.");

        group.MapPost("/{id:int}/confirm", async (int id, ICurrentUser currentUser, BookingService svc) =>
        {
            await svc.ConfirmAsync(id, currentUser.RequireUserId());
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Confirm a held booking before it expires.");

        group.MapDelete("/{id:int}", async (int id, ICurrentUser currentUser, BookingService svc) =>
        {
            await svc.CancelAsync(id, currentUser.RequireUserId());
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Cancel the caller's own booking.");

        group.MapGet("/mine", async (ICurrentUser currentUser, BookingService svc) =>
            Results.Ok(await svc.GetMineAsync(currentUser.RequireUserId())))
            .Produces<IReadOnlyList<MyBookingDto>>()
            .WithDescription("List the caller's own bookings.");

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
        }).WithTags("Booking")
          .WithDescription("Server-sent events stream: notifies subscribers when a location/date's slots change.");
    }
}

internal sealed record HoldRequest(
    int LocationId, int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime, List<int> TreatmentIds);

internal sealed record HoldResponse(int BookingId, DateTime ExpiresAt);

internal sealed class HoldRequestValidator : AbstractValidator<HoldRequest>
{
    public HoldRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.RoomId).GreaterThan(0);
        RuleFor(x => x.TherapistId).GreaterThan(0);
        RuleFor(x => x.EndTime).GreaterThan(x => x.StartTime);
        RuleFor(x => x.TreatmentIds).NotEmpty();
    }
}
