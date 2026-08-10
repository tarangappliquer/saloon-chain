using FluentValidation;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Scheduling.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Scheduling.Endpoints;

internal static class SchedulingEndpoints
{
    public static void MapSchedulingEndpoints(this IEndpointRouteBuilder app)
    {
        // SuperAdmin/Admin/Manager/Receptionist all do scheduling per spec -- Manager/Receptionist
        // (staff of one location) are pinned to their own LocationId below; Admin's chain-scoping is
        // accepted at the same trust level as the Rooms/Therapists catalog endpoints (the location
        // picker feeding this page is already chain-scoped for Admin).
        var group = app.MapGroup("/api/admin/scheduling").RequireAuthorization("AdminAccess").WithTags("Scheduling")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/roster", async (int locationId, DateOnly date, ICurrentUser currentUser, SchedulingRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetRosterAsync(locationId, date));
        }).Produces<RosterDto>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Get a location's therapist shifts and room openings for a date.");

        group.MapPost("/therapist-shifts", async (AssignTherapistShiftRequest req, ICurrentUser currentUser, SchedulingRepository repo, CatalogRepository catalogRepo, BookingService bookingSvc) =>
        {
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var rooms = await catalogRepo.GetRoomsAsync(req.LocationId);
            if (!rooms.Any(r => r.Id == req.RoomId))
                return Results.Problem("Room does not belong to this location.", statusCode: StatusCodes.Status400BadRequest);

            var id = await repo.AssignTherapistShiftAsync(
                req.LocationId, req.TherapistId, req.RoomId, req.ShiftType, req.WorkDate, req.StartTime, req.EndTime);
            await bookingSvc.SyncAndNotifyAsync(req.LocationId, req.WorkDate);
            return Results.Ok(new IdResponse(id));
        }).WithValidation<AssignTherapistShiftRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Assign a therapist to a shift at a location/date.");

        group.MapDelete("/therapist-shifts/{id:int}", async (int id, ICurrentUser currentUser, SchedulingRepository repo, BookingService bookingSvc) =>
        {
            var shift = await repo.GetShiftDetailsAsync(id);
            if (shift is null) return Results.NotFound();

            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && shift.LocationId != currentUser.LocationId)
                return Results.Problem("Not authorized for this shift.", statusCode: StatusCodes.Status403Forbidden);

            if (await repo.HasShiftBookingsAsync(id))
                return Results.Problem("Cannot remove therapist; existing bookings exist for this shift.", statusCode: StatusCodes.Status400BadRequest);

            await repo.RemoveTherapistShiftAsync(id);
            var workDate = DateOnly.FromDateTime(shift.WorkDate);
            await bookingSvc.SyncAndNotifyAsync(shift.LocationId, workDate);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Remove a therapist's shift assignment.");

        group.MapPost("/room-openings", async (OpenRoomRequest req, ICurrentUser currentUser, SchedulingRepository repo, CatalogRepository catalogRepo, BookingService bookingSvc) =>
        {
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && currentUser.LocationId is { } locationId)
            {
                var myRooms = await catalogRepo.GetRoomsAsync(locationId);
                if (!myRooms.Any(r => r.Id == req.RoomId))
                    return Results.Problem("Not authorized for this room.", statusCode: StatusCodes.Status403Forbidden);
            }

            var existing = await repo.GetRoomOpeningByKeysAsync(req.RoomId, req.WorkDate, req.ShiftType);
            if (existing is not null && existing.TreatmentCategoryId != req.TreatmentCategoryId && await repo.HasRoomBookingsAsync(req.RoomId, req.WorkDate))
            {
                return Results.Problem("Cannot change category; existing bookings exist for this room.", statusCode: StatusCodes.Status400BadRequest);
            }

            var id = await repo.OpenRoomAsync(req.RoomId, req.TreatmentCategoryId, req.ShiftType, req.WorkDate);
            var roomOpening = await repo.GetRoomOpeningDetailsAsync(id);
            var roomLocId = roomOpening?.LocationId ?? currentUser.LocationId ?? 0;
            if (roomLocId > 0)
            {
                await bookingSvc.SyncAndNotifyAsync(roomLocId, req.WorkDate);
            }
            return Results.Ok(new IdResponse(id));
        }).WithValidation<OpenRoomRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Open a room for a treatment category during a shift/date.");

        group.MapDelete("/room-openings/{id:int}", async (int id, ICurrentUser currentUser, SchedulingRepository repo, BookingService bookingSvc) =>
        {
            var opening = await repo.GetRoomOpeningDetailsAsync(id);
            if (opening is null) return Results.NotFound();

            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && opening.LocationId != currentUser.LocationId)
                return Results.Problem("Not authorized for this room opening.", statusCode: StatusCodes.Status403Forbidden);

            var workDate = DateOnly.FromDateTime(opening.WorkDate);
            if (await repo.HasRoomBookingsAsync(opening.RoomId, workDate))
                return Results.Problem("Cannot close room; existing bookings exist for this room.", statusCode: StatusCodes.Status400BadRequest);

            await repo.CloseRoomAsync(id);
            await bookingSvc.SyncAndNotifyAsync(opening.LocationId, workDate);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Close a room opening.");

        group.MapPost("/blocked-slots", async (BlockSlotRequest req, ICurrentUser currentUser, SchedulingRepository repo, CatalogRepository catalogRepo, BookingService bookingSvc) =>
        {
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && currentUser.LocationId is { } locationId)
            {
                var myRooms = await catalogRepo.GetRoomsAsync(locationId);
                if (!myRooms.Any(r => r.Id == req.RoomId))
                    return Results.Problem("Not authorized for this room.", statusCode: StatusCodes.Status403Forbidden);
            }

            if (!await repo.HasRoomOpeningAsync(req.RoomId, req.WorkDate))
                return Results.Problem("Cannot block slot; room is not open on this date.", statusCode: StatusCodes.Status400BadRequest);

            if (await repo.HasBookingOverlapAsync(req.RoomId, req.WorkDate, req.StartTime, req.EndTime))
                return Results.Problem("Cannot block slot; a booking already exists for this time.", statusCode: StatusCodes.Status400BadRequest);

            if (await repo.HasBlockOverlapAsync(req.RoomId, req.WorkDate, req.StartTime, req.EndTime))
                return Results.Problem("Cannot block slot; it overlaps an existing blocked slot.", statusCode: StatusCodes.Status400BadRequest);

            var id = await repo.BlockSlotAsync(req.RoomId, req.WorkDate, req.StartTime, req.EndTime, req.Reason);
            var blocked = await repo.GetBlockedSlotDetailsAsync(id);
            var roomLocId = blocked?.LocationId ?? currentUser.LocationId ?? 0;
            if (roomLocId > 0)
            {
                await bookingSvc.SyncAndNotifyAsync(roomLocId, req.WorkDate);
            }
            return Results.Ok(new IdResponse(id));
        }).WithValidation<BlockSlotRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Block a room/time slot for a reason (lunch break, therapist leave, etc). Fails if the slot already has a booking.");

        group.MapDelete("/blocked-slots/{id:int}", async (int id, ICurrentUser currentUser, SchedulingRepository repo, BookingService bookingSvc) =>
        {
            var blocked = await repo.GetBlockedSlotDetailsAsync(id);
            if (blocked is null) return Results.NotFound();

            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && blocked.LocationId != currentUser.LocationId)
                return Results.Problem("Not authorized for this blocked slot.", statusCode: StatusCodes.Status403Forbidden);

            await repo.UnblockSlotAsync(id);
            var workDate = DateOnly.FromDateTime(blocked.WorkDate);
            await bookingSvc.SyncAndNotifyAsync(blocked.LocationId, workDate);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Unblock a previously blocked room/time slot.");
    }
}

internal sealed record IdResponse(int Id);

internal sealed record AssignTherapistShiftRequest(
    int LocationId, int TherapistId, int RoomId, string ShiftType, DateOnly WorkDate, TimeSpan StartTime, TimeSpan EndTime);

internal sealed record OpenRoomRequest(int RoomId, int TreatmentCategoryId, string ShiftType, DateOnly WorkDate);

internal sealed record BlockSlotRequest(int RoomId, DateOnly WorkDate, TimeSpan StartTime, TimeSpan EndTime, string Reason);

internal sealed class AssignTherapistShiftRequestValidator : AbstractValidator<AssignTherapistShiftRequest>
{
    public AssignTherapistShiftRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.TherapistId).GreaterThan(0);
        RuleFor(x => x.RoomId).GreaterThan(0);
        RuleFor(x => x.ShiftType).Must(s => s is "Morning" or "Evening").WithMessage("ShiftType must be Morning or Evening.");
        RuleFor(x => x.EndTime).GreaterThan(x => x.StartTime);
    }
}

internal sealed class OpenRoomRequestValidator : AbstractValidator<OpenRoomRequest>
{
    public OpenRoomRequestValidator()
    {
        RuleFor(x => x.RoomId).GreaterThan(0);
        RuleFor(x => x.TreatmentCategoryId).GreaterThan(0);
        RuleFor(x => x.ShiftType).Must(s => s is "Morning" or "Evening").WithMessage("ShiftType must be Morning or Evening.");
    }
}

internal sealed class BlockSlotRequestValidator : AbstractValidator<BlockSlotRequest>
{
    public BlockSlotRequestValidator()
    {
        RuleFor(x => x.RoomId).GreaterThan(0);
        RuleFor(x => x.EndTime).GreaterThan(x => x.StartTime);
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(200);
    }
}
