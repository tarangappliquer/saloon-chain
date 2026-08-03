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

        group.MapPost("/draft", async (DraftRequest req, ICurrentUser currentUser, BookingService svc) =>
        {
            var bookingId = await svc.CreateDraftAsync(req.LocationId, currentUser.RequireUserId(), req.TreatmentIds);
            return Results.Ok(new DraftResponse(bookingId));
        }).WithValidation<DraftRequest>()
          .Produces<DraftResponse>()
          .WithDescription("Start a draft booking for one or more treatments, before any time is picked.");

        group.MapGet("/{id:int}", async (int id, ICurrentUser currentUser, BookingService svc) =>
        {
            var details = await svc.GetByIdAsync(id, currentUser.RequireUserId());
            return details is null ? Results.NotFound() : Results.Ok(details);
        }).Produces<BookingDetailsDto>()
          .ProducesProblem(StatusCodes.Status404NotFound)
          .WithDescription("Fetch a draft/booking's current state -- powers refresh-restore from the booking id in the URL.");

        group.MapPost("/{id:int}/treatments", async (int id, AddTreatmentRequest req, ICurrentUser currentUser, BookingService svc) =>
        {
            await svc.AddTreatmentAsync(id, currentUser.RequireUserId(), req.TreatmentId);
            return Results.NoContent();
        }).WithValidation<AddTreatmentRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Add another treatment to a draft booking.");

        group.MapDelete("/{id:int}/treatments/{treatmentId:int}", async (int id, int treatmentId, ICurrentUser currentUser, BookingService svc) =>
        {
            await svc.RemoveTreatmentAsync(id, currentUser.RequireUserId(), treatmentId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Remove a treatment from a draft booking, freeing its slot if it had one.");

        group.MapPut("/{id:int}/treatments/{treatmentId:int}/schedule", async (
            int id, int treatmentId, ScheduleRequest req, ICurrentUser currentUser, BookingService svc) =>
        {
            var expiresAt = await svc.ScheduleTreatmentAsync(
                id, currentUser.RequireUserId(), treatmentId, req.RoomId, req.TherapistId, req.StartTime, req.EndTime);
            return Results.Ok(new ScheduleResponse(expiresAt));
        }).WithValidation<ScheduleRequest>()
          .Produces<ScheduleResponse>()
          .WithDescription("Claim a specific room/therapist/time slot for one treatment on a draft booking.");

        group.MapPost("/{id:int}/confirm", async (int id, ICurrentUser currentUser, BookingService svc) =>
        {
            await svc.ConfirmAsync(id, currentUser.RequireUserId());
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Confirm every scheduled treatment on a draft booking before its holds expire.");

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

internal sealed record DraftRequest(int LocationId, List<int> TreatmentIds);
internal sealed record DraftResponse(int BookingId);
internal sealed record AddTreatmentRequest(int TreatmentId);
internal sealed record ScheduleRequest(int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime);
internal sealed record ScheduleResponse(DateTime ExpiresAt);

internal sealed class DraftRequestValidator : AbstractValidator<DraftRequest>
{
    public DraftRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.TreatmentIds).NotEmpty();
    }
}

internal sealed class AddTreatmentRequestValidator : AbstractValidator<AddTreatmentRequest>
{
    public AddTreatmentRequestValidator()
    {
        RuleFor(x => x.TreatmentId).GreaterThan(0);
    }
}

internal sealed class ScheduleRequestValidator : AbstractValidator<ScheduleRequest>
{
    public ScheduleRequestValidator()
    {
        RuleFor(x => x.RoomId).GreaterThan(0);
        RuleFor(x => x.TherapistId).GreaterThan(0);
        RuleFor(x => x.EndTime).GreaterThan(x => x.StartTime);
    }
}
