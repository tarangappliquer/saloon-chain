using FluentValidation;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminCatalogEndpoints
{
    public static void MapAdminCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/catalog").RequireAuthorization("AdminAccess").WithTags("Admin Catalog")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        // Read stays under the group's plain AdminAccess -- Manager/Receptionist still need this
        // list to power the chain/location pickers on Locations/Treatments/Rooms/Staff/Bookings,
        // even though they can't create/edit chains (see the ChainManagement-gated routes below).
        // Scoping still applies to SuperAdmin/Admin, who only ever see their own chain via ChainId
        // on dbo.Users. Manager and Receptionist have no ChainId of their own (LocationId-scoped
        // instead, see 01_tables.sql), so this passes null for them and they see every chain --
        // moot in practice since there's exactly one chain, but keeps this endpoint correct if a
        // second chain is ever added. RootSuperAdmin also passes null (it has no chain either, and
        // is meant to see all of them).
        group.MapGet("/chains", async (ICurrentUser currentUser, CatalogRepository repo) =>
            Results.Ok(await repo.GetChainsForAdminAsync(currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) ? currentUser.ChainId : null)))
            .Produces<IEnumerable<AdminChainDto>>()
            .WithDescription("List chains visible to the caller (all for RootSuperAdmin/Manager/Receptionist, own chain only for SuperAdmin/Admin).");

        group.MapGet("/locations", async (int chainId, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) && currentUser.ChainId != chainId)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetLocationsForAdminAsync(chainId));
        }).Produces<IEnumerable<AdminLocationDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a chain's locations, including inactive ones.");

        group.MapGet("/treatments", async (int chainId, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) && currentUser.ChainId != chainId)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetTreatmentsForAdminAsync(chainId));
        }).Produces<IEnumerable<AdminTreatmentDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a chain's treatments, including inactive ones.");

        group.MapPost("/chains", async (ChainRequest req, CatalogRepository repo) =>
            Results.Ok(new IdResponse(await repo.CreateChainAsync(req.Name))))
            .WithValidation<ChainRequest>()
            .RequireAuthorization("ChainManagement")
            .Produces<IdResponse>()
            .WithDescription("Create a new saloon chain (RootSuperAdmin only).");

        // No scoping check needed in these three handlers -- ChainManagement admits only
        // RootSuperAdmin (see Program.cs), which has no chain of its own to be scoped by.
        group.MapPut("/chains/{id:int}", async (int id, ChainUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateChainAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<ChainUpdateRequest>().RequireAuthorization("ChainManagement")
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Rename or activate/deactivate a chain (RootSuperAdmin only).");

        group.MapDelete("/chains/{id:int}", async (int id, CatalogRepository repo) =>
        {
            await repo.DeleteChainAsync(id);
            return Results.NoContent();
        }).RequireAuthorization("ChainManagement")
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Soft-delete a chain (RootSuperAdmin only).");

        group.MapPost("/locations", async (LocationRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) && currentUser.ChainId != req.ChainId)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(new IdResponse(await repo.CreateLocationAsync(
                req.ChainId, req.Name, req.Address, req.OpenTime, req.CloseTime, req.WorkingDaysMask, req.TimeZoneId)));
        }).WithValidation<LocationRequest>().RequireAuthorization("LocationManagement")
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new location under a chain.");

        // Admin-owns-this-location isn't checked here (PUT/DELETE only carry the location id, not
        // its chain) -- accepted at the same trust level Rooms/Therapists already operate at: the
        // location id only ever reaches this handler via a dropdown that GET /locations already
        // scoped to the caller's own chain, so an Admin has no way to discover another chain's id.
        group.MapPut("/locations/{id:int}", async (int id, LocationUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateLocationAsync(
                id, req.Name, req.Address, req.OpenTime, req.CloseTime, req.WorkingDaysMask, req.TimeZoneId, req.IsActive);
            return Results.NoContent();
        }).WithValidation<LocationUpdateRequest>().RequireAuthorization("LocationManagement")
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Update a location's details or active state.");

        group.MapDelete("/locations/{id:int}", async (int id, CatalogRepository repo) =>
        {
            await repo.DeleteLocationAsync(id);
            return Results.NoContent();
        }).RequireAuthorization("LocationManagement")
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Soft-delete a location.");

        group.MapGet("/treatment-categories", async (int chainId, CatalogRepository repo) =>
            Results.Ok(await repo.GetTreatmentCategoriesAsync(chainId)))
            .Produces<IEnumerable<TreatmentCategoryDto>>()
            .WithDescription("List a chain's treatment categories.");

        group.MapPost("/treatment-categories", async (TreatmentCategoryRequest req, CatalogRepository repo) =>
            Results.Ok(new IdResponse(await repo.CreateTreatmentCategoryAsync(req.ChainId, req.Name))))
            .WithValidation<TreatmentCategoryRequest>()
            .Produces<IdResponse>()
            .WithDescription("Create a new treatment category under a chain.");

        group.MapPost("/treatments", async (TreatmentRequest req, CatalogRepository repo) =>
            Results.Ok(new IdResponse(
                await repo.CreateTreatmentAsync(req.ChainId, req.CategoryId, req.Name, req.Price, req.DurationSlots))))
            .WithValidation<TreatmentRequest>()
            .Produces<IdResponse>()
            .WithDescription("Create a new treatment under a chain/category.");

        group.MapPut("/treatments/{id:int}", async (int id, TreatmentUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateTreatmentAsync(id, req.CategoryId, req.Name, req.Price, req.DurationSlots, req.IsActive);
            return Results.NoContent();
        }).WithValidation<TreatmentUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Update a treatment's details or active state.");

        group.MapPost("/treatments/{id:int}/assign", async (int id, AssignTreatmentRequest req, CatalogRepository repo) =>
        {
            await repo.AssignTreatmentToLocationAsync(req.LocationId, id, req.PriceOverride);
            return Results.NoContent();
        }).WithValidation<AssignTreatmentRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Assign a treatment to a location, optionally overriding its price there.");

        group.MapDelete("/locations/{locationId:int}/treatments/{treatmentId:int}", async (int locationId, int treatmentId, CatalogRepository repo) =>
        {
            await repo.UnassignTreatmentFromLocationAsync(locationId, treatmentId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Remove a treatment from a location.");

        group.MapGet("/therapists", async (CatalogRepository repo) =>
            Results.Ok(await repo.GetTherapistsAsync()))
            .Produces<IEnumerable<TherapistDto>>()
            .WithDescription("List every therapist.");

        group.MapPost("/therapists", async (TherapistRequest req, CatalogRepository repo) =>
            Results.Ok(new IdResponse(await repo.CreateTherapistAsync(req.Name))))
            .WithValidation<TherapistRequest>()
            .Produces<IdResponse>()
            .WithDescription("Create a new therapist.");

        group.MapPut("/therapists/{id:int}", async (int id, TherapistUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateTherapistAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<TherapistUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Update a therapist's name or active state.");

        // GET stays under the group's plain AdminAccess -- Manager/Receptionist still need the room
        // list to power the Scheduling page (room-opening), even though they can't add/edit rooms.
        group.MapGet("/rooms", async (int locationId, CatalogRepository repo) =>
            Results.Ok(await repo.GetRoomsAsync(locationId)))
            .Produces<IEnumerable<RoomDto>>()
            .WithDescription("List a location's rooms.");

        group.MapPost("/rooms", async (RoomRequest req, CatalogRepository repo) =>
            Results.Ok(new IdResponse(await repo.CreateRoomAsync(req.LocationId, req.Name))))
            .WithValidation<RoomRequest>()
            .RequireAuthorization("LocationManagement")
            .Produces<IdResponse>()
            .WithDescription("Create a new room under a location.");

        group.MapPut("/rooms/{id:int}", async (int id, RoomUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateRoomAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<RoomUpdateRequest>().RequireAuthorization("LocationManagement")
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Update a room's name or active state.");
    }
}

// Shared by every Admin endpoint (this file, AdminStaffEndpoints, SchedulingEndpoints has its own
// copy since it's a different namespace) that used to return an anonymous `new { Id = x }` -- named
// so it can be used as a type argument to .Produces<T>() for OpenAPI response typing.
internal sealed record IdResponse(int Id);

internal sealed record ChainRequest(string Name);
internal sealed record ChainUpdateRequest(string Name, bool IsActive);

internal sealed record LocationRequest(
    int ChainId, string Name, string? Address, TimeSpan OpenTime, TimeSpan CloseTime, byte WorkingDaysMask, string TimeZoneId);
internal sealed record LocationUpdateRequest(
    string Name, string? Address, TimeSpan OpenTime, TimeSpan CloseTime, byte WorkingDaysMask, string TimeZoneId, bool IsActive);

internal sealed record TreatmentCategoryRequest(int ChainId, string Name);

internal sealed record TreatmentRequest(int ChainId, int CategoryId, string Name, decimal Price, short DurationSlots);
internal sealed record TreatmentUpdateRequest(int CategoryId, string Name, decimal Price, short DurationSlots, bool IsActive);
internal sealed record AssignTreatmentRequest(int LocationId, decimal? PriceOverride);

internal sealed record TherapistRequest(string Name);
internal sealed record TherapistUpdateRequest(string Name, bool IsActive);

internal sealed record RoomRequest(int LocationId, string Name);
internal sealed record RoomUpdateRequest(string Name, bool IsActive);

internal sealed class ChainRequestValidator : AbstractValidator<ChainRequest>
{
    public ChainRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
}

internal sealed class ChainUpdateRequestValidator : AbstractValidator<ChainUpdateRequest>
{
    public ChainUpdateRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
}

internal sealed class LocationRequestValidator : AbstractValidator<LocationRequest>
{
    public LocationRequestValidator()
    {
        RuleFor(x => x.ChainId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Address).MaximumLength(400);
        RuleFor(x => x.CloseTime).GreaterThan(x => x.OpenTime);
        RuleFor(x => x.TimeZoneId).NotEmpty();
    }
}

internal sealed class LocationUpdateRequestValidator : AbstractValidator<LocationUpdateRequest>
{
    public LocationUpdateRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Address).MaximumLength(400);
        RuleFor(x => x.CloseTime).GreaterThan(x => x.OpenTime);
        RuleFor(x => x.TimeZoneId).NotEmpty();
    }
}

internal sealed class TreatmentCategoryRequestValidator : AbstractValidator<TreatmentCategoryRequest>
{
    public TreatmentCategoryRequestValidator()
    {
        RuleFor(x => x.ChainId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}

internal sealed class TreatmentRequestValidator : AbstractValidator<TreatmentRequest>
{
    public TreatmentRequestValidator()
    {
        RuleFor(x => x.ChainId).GreaterThan(0);
        RuleFor(x => x.CategoryId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Price).GreaterThan(0);
        RuleFor(x => x.DurationSlots).GreaterThan((short)0);
    }
}

internal sealed class TreatmentUpdateRequestValidator : AbstractValidator<TreatmentUpdateRequest>
{
    public TreatmentUpdateRequestValidator()
    {
        RuleFor(x => x.CategoryId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Price).GreaterThan(0);
        RuleFor(x => x.DurationSlots).GreaterThan((short)0);
    }
}

internal sealed class AssignTreatmentRequestValidator : AbstractValidator<AssignTreatmentRequest>
{
    public AssignTreatmentRequestValidator() => RuleFor(x => x.LocationId).GreaterThan(0);
}

internal sealed class TherapistRequestValidator : AbstractValidator<TherapistRequest>
{
    public TherapistRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
}

internal sealed class TherapistUpdateRequestValidator : AbstractValidator<TherapistUpdateRequest>
{
    public TherapistUpdateRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
}

internal sealed class RoomRequestValidator : AbstractValidator<RoomRequest>
{
    public RoomRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}

internal sealed class RoomUpdateRequestValidator : AbstractValidator<RoomUpdateRequest>
{
    public RoomUpdateRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
}
