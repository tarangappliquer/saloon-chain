using FluentValidation;
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

        group.MapPost("/therapist-shifts", async (AssignTherapistShiftRequest req, ICurrentUser currentUser, SchedulingRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var id = await repo.AssignTherapistShiftAsync(
                req.LocationId, req.TherapistId, req.ShiftType, req.WorkDate, req.StartTime, req.EndTime);
            return Results.Ok(new IdResponse(id));
        }).WithValidation<AssignTherapistShiftRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Assign a therapist to a shift at a location/date.");

        group.MapDelete("/therapist-shifts/{id:int}", async (int id, SchedulingRepository repo) =>
        {
            await repo.RemoveTherapistShiftAsync(id);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Remove a therapist's shift assignment.");

        group.MapPost("/room-openings", async (OpenRoomRequest req, SchedulingRepository repo) =>
        {
            var id = await repo.OpenRoomAsync(req.RoomId, req.TreatmentCategoryId, req.ShiftType, req.WorkDate);
            return Results.Ok(new IdResponse(id));
        }).WithValidation<OpenRoomRequest>()
          .Produces<IdResponse>()
          .WithDescription("Open a room for a treatment category during a shift/date.");

        group.MapDelete("/room-openings/{id:int}", async (int id, SchedulingRepository repo) =>
        {
            await repo.CloseRoomAsync(id);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Close a room opening.");
    }
}

internal sealed record IdResponse(int Id);

internal sealed record AssignTherapistShiftRequest(
    int LocationId, int TherapistId, string ShiftType, DateOnly WorkDate, TimeSpan StartTime, TimeSpan EndTime);

internal sealed record OpenRoomRequest(int RoomId, int TreatmentCategoryId, string ShiftType, DateOnly WorkDate);

internal sealed class AssignTherapistShiftRequestValidator : AbstractValidator<AssignTherapistShiftRequest>
{
    public AssignTherapistShiftRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.TherapistId).GreaterThan(0);
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
