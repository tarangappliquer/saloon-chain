using FluentValidation;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminCatalogEndpoints
{
    public static void MapAdminCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/catalog").RequireAuthorization("AdminAccess");

        // Read stays under the group's plain AdminAccess -- Manager still needs this list to power
        // the chain/location pickers on Locations/Treatments/Rooms/Staff/Bookings, even though
        // Manager can't create/edit chains (see the ChainManagement-gated routes below). Scoping is
        // still applied: Admin only ever sees their own chain (dbo.Users.ChainId); Manager has no
        // ChainId (LocationId-scoped instead, see 01_tables.sql), so this passes null for them and
        // they see every chain, same as before this endpoint had any scoping.
        group.MapGet("/chains", async (ICurrentUser currentUser, CatalogRepository repo) =>
            Results.Ok(await repo.GetChainsForAdminAsync(currentUser.IsInRole(UserRole.Admin) ? currentUser.ChainId : null)));

        group.MapGet("/locations", async (int chainId, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Admin) && currentUser.ChainId != chainId)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetLocationsForAdminAsync(chainId));
        });

        group.MapGet("/treatments", async (int chainId, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Admin) && currentUser.ChainId != chainId)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetTreatmentsForAdminAsync(chainId));
        });

        group.MapPost("/chains", async (ChainRequest req, CatalogRepository repo) =>
            Results.Ok(new { Id = await repo.CreateChainAsync(req.Name) }))
            .WithValidation<ChainRequest>()
            .RequireAuthorization("ChainManagement");

        group.MapPut("/chains/{id:int}", async (int id, ChainUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Admin) && currentUser.ChainId != id)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);

            await repo.UpdateChainAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<ChainUpdateRequest>().RequireAuthorization("ChainManagement");

        group.MapPost("/locations", async (LocationRequest req, CatalogRepository repo) =>
            Results.Ok(new
            {
                Id = await repo.CreateLocationAsync(
                    req.ChainId, req.Name, req.Address, req.OpenTime, req.CloseTime, req.WorkingDaysMask, req.TimeZoneId)
            })).WithValidation<LocationRequest>();

        group.MapPut("/locations/{id:int}", async (int id, LocationUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateLocationAsync(
                id, req.Name, req.Address, req.OpenTime, req.CloseTime, req.WorkingDaysMask, req.TimeZoneId, req.IsActive);
            return Results.NoContent();
        }).WithValidation<LocationUpdateRequest>();

        group.MapGet("/treatment-categories", async (int chainId, CatalogRepository repo) =>
            Results.Ok(await repo.GetTreatmentCategoriesAsync(chainId)));

        group.MapPost("/treatment-categories", async (TreatmentCategoryRequest req, CatalogRepository repo) =>
            Results.Ok(new { Id = await repo.CreateTreatmentCategoryAsync(req.ChainId, req.Name) }))
            .WithValidation<TreatmentCategoryRequest>();

        group.MapPost("/treatments", async (TreatmentRequest req, CatalogRepository repo) =>
            Results.Ok(new
            {
                Id = await repo.CreateTreatmentAsync(req.ChainId, req.CategoryId, req.Name, req.Price, req.DurationSlots)
            })).WithValidation<TreatmentRequest>();

        group.MapPut("/treatments/{id:int}", async (int id, TreatmentUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateTreatmentAsync(id, req.CategoryId, req.Name, req.Price, req.DurationSlots, req.IsActive);
            return Results.NoContent();
        }).WithValidation<TreatmentUpdateRequest>();

        group.MapPost("/treatments/{id:int}/assign", async (int id, AssignTreatmentRequest req, CatalogRepository repo) =>
        {
            await repo.AssignTreatmentToLocationAsync(req.LocationId, id, req.PriceOverride);
            return Results.NoContent();
        }).WithValidation<AssignTreatmentRequest>();

        group.MapDelete("/locations/{locationId:int}/treatments/{treatmentId:int}", async (int locationId, int treatmentId, CatalogRepository repo) =>
        {
            await repo.UnassignTreatmentFromLocationAsync(locationId, treatmentId);
            return Results.NoContent();
        });

        group.MapGet("/therapists", async (CatalogRepository repo) =>
            Results.Ok(await repo.GetTherapistsAsync()));

        group.MapPost("/therapists", async (TherapistRequest req, CatalogRepository repo) =>
            Results.Ok(new { Id = await repo.CreateTherapistAsync(req.Name) })).WithValidation<TherapistRequest>();

        group.MapPut("/therapists/{id:int}", async (int id, TherapistUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateTherapistAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<TherapistUpdateRequest>();

        group.MapGet("/rooms", async (int locationId, CatalogRepository repo) =>
            Results.Ok(await repo.GetRoomsAsync(locationId)));

        group.MapPost("/rooms", async (RoomRequest req, CatalogRepository repo) =>
            Results.Ok(new { Id = await repo.CreateRoomAsync(req.LocationId, req.Name) })).WithValidation<RoomRequest>();

        group.MapPut("/rooms/{id:int}", async (int id, RoomUpdateRequest req, CatalogRepository repo) =>
        {
            await repo.UpdateRoomAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<RoomUpdateRequest>();
    }
}

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
