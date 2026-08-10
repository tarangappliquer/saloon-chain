using FluentValidation;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Identity.Infrastructure;
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

        group.MapGet("/available-dates", async (int locationId, DateOnly from, DateOnly to, string? treatmentIds, int? excludeBookingId, BookingService svc) =>
        {
            var ids = new List<int>();
            if (!string.IsNullOrEmpty(treatmentIds))
            {
                foreach (var part in treatmentIds.Split(',', StringSplitOptions.RemoveEmptyEntries))
                {
                    if (int.TryParse(part, out var id)) ids.Add(id);
                }
            }
            return Results.Ok(await svc.GetAvailableDatesAsync(locationId, from, to, ids, excludeBookingId));
        })
            .Produces<IReadOnlyList<DateOnly>>()
            .WithDescription("List dates in range that have at least one open slot for all requested treatments at a location.");

        group.MapGet("/available-slots", async (int locationId, string treatmentIds, DateOnly date, int? excludeBookingId, BookingService svc) =>
        {
            var parts = treatmentIds.Split(',', StringSplitOptions.RemoveEmptyEntries);
            var ids = new List<int>(parts.Length);
            foreach (var part in parts)
            {
                if (!int.TryParse(part, out var id))
                    return Results.Problem($"Invalid treatmentIds value '{part}'.", statusCode: StatusCodes.Status400BadRequest);
                ids.Add(id);
            }

            return Results.Ok(await svc.GetAvailableSlotsAsync(locationId, ids, date, excludeBookingId));
        }).Produces<IReadOnlyList<AvailableSlot>>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("List open time slots for a treatment combo at a location/date.");

        group.MapPost("/draft", async (DraftRequest req, ICurrentUser currentUser, UserRepository userRepo, BookingService svc) =>
        {
            var customerId = currentUser.RequireUserId();

            // POS / front-desk: staff can book for a walk-in customer without emulating them, as
            // long as they're actually allowed to act at this location.
            if (req.CustomerId is { } targetCustomerId)
            {
                if (!CanActOnBehalfOfCustomer(currentUser))
                    return Results.Problem("Not authorized to book on behalf of another customer.", statusCode: StatusCodes.Status403Forbidden);

                if (currentUser.IsInRole(UserRole.Receptionist, UserRole.Manager) && currentUser.LocationId != req.LocationId)
                    return Results.Problem("You can only book at your own location.", statusCode: StatusCodes.Status403Forbidden);

                customerId = targetCustomerId;
            }
            else if (currentUser.EmulatedByUserId is { } emulatorId)
            {
                var emulator = await userRepo.GetByIdAsync(emulatorId);
                if (emulator is not null && (emulator.Role == UserRole.SuperAdmin || emulator.Role == UserRole.Admin))
                {
                    if (emulator.LocationId is not null && req.LocationId != emulator.LocationId.Value)
                    {
                        return Results.Problem("During emulation, you can only book treatments in your own location.", statusCode: StatusCodes.Status403Forbidden);
                    }
                    if (emulator.ChainId is not null)
                    {
                        var isLocationInChain = await userRepo.IsLocationInChainAsync(req.LocationId, emulator.ChainId.Value);
                        if (!isLocationInChain)
                        {
                            return Results.Problem("During emulation, you can only book treatments in your own saloon.", statusCode: StatusCodes.Status403Forbidden);
                        }
                    }
                }
                // Manager and Receptionist are both pinned to exactly one location (unlike Admin/
                // SuperAdmin's chain-wide reach) -- the SuperAdmin/Admin branch above never applied
                // to either, so an emulating Manager/Receptionist could previously book a customer at
                // any location system-wide.
                else if (emulator is not null && emulator.Role is UserRole.Manager or UserRole.Receptionist && emulator.LocationId != req.LocationId)
                {
                    return Results.Problem("During emulation, you can only book treatments in your own location.", statusCode: StatusCodes.Status403Forbidden);
                }
            }
            var bookingId = await svc.CreateDraftAsync(req.LocationId, customerId, req.TreatmentIds);
            return Results.Ok(new DraftResponse(bookingId));
        }).WithValidation<DraftRequest>()
          .Produces<DraftResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Start a draft booking for one or more treatments, before any time is picked.");

        group.MapGet("/{id:int}", async (int id, ICurrentUser currentUser, BookingService svc) =>
        {
            var details = await svc.GetByIdAsync(id, currentUser.RequireUserId());
            return details is null ? Results.NotFound() : Results.Ok(details);
        }).Produces<BookingDetailsDto>()
          .ProducesProblem(StatusCodes.Status404NotFound)
          .WithDescription("Fetch a draft/booking's current state -- powers refresh-restore from the booking id in the URL.");

        group.MapPost("/{id:int}/treatments", async (int id, AddTreatmentRequest req, ICurrentUser currentUser, BookingRepository repo, BookingService svc) =>
        {
            var customerId = currentUser.RequireUserId();
            if (req.CustomerId is { } targetCustomerId)
            {
                var error = await AuthorizeActingOnBookingAsync(id, currentUser, repo);
                if (error is not null) return error;
                customerId = targetCustomerId;
            }

            await svc.AddTreatmentAsync(id, customerId, req.TreatmentId);
            return Results.NoContent();
        }).WithValidation<AddTreatmentRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Add another treatment to a draft booking.");

        group.MapDelete("/{id:int}/treatments/{treatmentId:int}", async (int id, int treatmentId, ICurrentUser currentUser, BookingService svc) =>
        {
            await svc.RemoveTreatmentAsync(id, currentUser.RequireUserId(), treatmentId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Remove a treatment from a draft booking, freeing its slot if it had one.");

        group.MapPut("/{id:int}/treatments/{treatmentId:int}/schedule", async (
            int id, int treatmentId, ScheduleRequest req, ICurrentUser currentUser, BookingRepository repo, BookingService svc) =>
        {
            var customerId = currentUser.RequireUserId();
            if (req.CustomerId is { } targetCustomerId)
            {
                var error = await AuthorizeActingOnBookingAsync(id, currentUser, repo);
                if (error is not null) return error;
                customerId = targetCustomerId;
            }

            var expiresAt = await svc.ScheduleTreatmentAsync(
                id, customerId, treatmentId, req.RoomId, req.TherapistId, req.StartTime, req.EndTime);
            return Results.Ok(new ScheduleResponse(expiresAt));
        }).WithValidation<ScheduleRequest>()
          .Produces<ScheduleResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Claim a specific room/therapist/time slot for one treatment on a draft booking.");

        group.MapPost("/{id:int}/confirm", async (int id, int? customerId, ICurrentUser currentUser, BookingRepository repo, BookingService svc) =>
        {
            var actingCustomerId = currentUser.RequireUserId();
            if (customerId is { } targetCustomerId)
            {
                var error = await AuthorizeActingOnBookingAsync(id, currentUser, repo);
                if (error is not null) return error;
                actingCustomerId = targetCustomerId;
            }

            await svc.ConfirmAsync(id, actingCustomerId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Confirm every scheduled treatment on a draft booking before its holds expire.");

        group.MapDelete("/{id:int}", async (int id, ICurrentUser currentUser, BookingService svc) =>
        {
            await svc.CancelAsync(id, currentUser.RequireUserId());
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Cancel the caller's own booking.");

        group.MapGet("/mine", async (ICurrentUser currentUser, UserRepository userRepo, BookingService svc) =>
        {
            int? filterChainId = null;
            int? filterLocationId = null;
            if (currentUser.EmulatedByUserId is { } emulatorId)
            {
                var emulator = await userRepo.GetByIdAsync(emulatorId);
                if (emulator is not null && (emulator.Role is UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager or UserRole.Receptionist))
                {
                    filterChainId = emulator.ChainId;
                }
                
                if (emulator is not null && emulator.Role is UserRole.Manager or UserRole.Receptionist)
                {
                    filterLocationId = emulator.LocationId;
                }
            }
            return Results.Ok(await svc.GetMineAsync(currentUser.RequireUserId(), filterChainId, filterLocationId));
        })
        .Produces<IReadOnlyList<MyBookingDto>>()
        .WithDescription("List the caller's own bookings.");

        // Anonymous: the event carries no customer data, just "something changed for this
        // location+date, refetch" -- and EventSource can't send an Authorization header anyway.
        app.MapGet("/api/booking/stream", async (int locationId, DateOnly? date, HttpContext ctx, SseBroadcaster sse, CancellationToken ct) =>
        {
            ctx.Response.Headers.ContentType = "text/event-stream";
            var groupKey = date.HasValue ? SseBroadcaster.Group(locationId, date.Value) : SseBroadcaster.LocationGroup(locationId);
            var (id, reader) = sse.Subscribe(groupKey);
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

    private static bool CanActOnBehalfOfCustomer(ICurrentUser currentUser) =>
        currentUser.IsInRole(UserRole.Receptionist, UserRole.Manager, UserRole.Admin, UserRole.SuperAdmin, UserRole.RootSuperAdmin);

    // Shared guard for every booking-scoped endpoint (add/schedule/confirm) once a staff-supplied
    // CustomerId override is present: role check plus, for location-scoped roles, an ownership
    // check against the booking's actual location (not the caller's own, which the request body
    // may not even carry past the draft step).
    private static async Task<IResult?> AuthorizeActingOnBookingAsync(int bookingId, ICurrentUser currentUser, BookingRepository repo)
    {
        if (!CanActOnBehalfOfCustomer(currentUser))
            return Results.Problem("Not authorized to modify this booking.", statusCode: StatusCodes.Status403Forbidden);

        if (currentUser.IsInRole(UserRole.Receptionist, UserRole.Manager) && await repo.GetLocationIdAsync(bookingId) != currentUser.LocationId)
            return Results.Problem("Not authorized for this booking.", statusCode: StatusCodes.Status403Forbidden);

        return null;
    }
}

internal sealed record DraftRequest(int LocationId, List<int> TreatmentIds, int? CustomerId = null);
internal sealed record DraftResponse(int BookingId);
internal sealed record AddTreatmentRequest(int TreatmentId, int? CustomerId = null);
internal sealed record ScheduleRequest(int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime, int? CustomerId = null);
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
