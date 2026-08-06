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

            var locations = await repo.GetLocationsForAdminAsync(chainId);

            // Manager has no ChainId to clamp the request itself (see above), so instead of rejecting
            // the whole chain, the sibling locations are filtered out of the result -- this is the
            // dropdown every location-scoped page (Rooms/Treatments/Locations) builds its picker from,
            // so leaving it unfiltered would hand a Manager every other location's id/name in their chain.
            if (currentUser.IsInRole(UserRole.Manager))
                locations = locations.Where(l => l.Id == currentUser.LocationId);

            return Results.Ok(locations);
        }).Produces<IEnumerable<AdminLocationDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a chain's locations, including inactive ones (Manager sees only their own).");

        // No chain/location ownership check here -- same trust level as GET /rooms: the location id
        // only ever reaches this handler via a dropdown that GET /locations already scoped to the
        // caller's own chain.
        // Manager (and Receptionist/Therapist/Other) have no chain id to drive the /locations dropdown
        // with -- this fetches their own location directly off ICurrentUser.LocationId instead, for
        // the Manager location-edit page.
        group.MapGet("/locations/mine", async (ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.LocationId is not { } locationId)
                return Results.Problem("Caller has no location of their own.", statusCode: StatusCodes.Status403Forbidden);

            var location = await repo.GetLocationByIdForAdminAsync(locationId);
            return location is null ? Results.NotFound() : Results.Ok(location);
        }).Produces<AdminLocationDto>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status404NotFound)
          .WithDescription("Get the caller's own location (Manager/Receptionist/Therapist/Other).");

        group.MapGet("/treatments", async (int locationId, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetTreatmentsForAdminAsync(locationId));
        }).Produces<IEnumerable<AdminTreatmentDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's treatments, including inactive ones.");

        group.MapPost("/chains", async (ChainRequest req, CatalogRepository repo) =>
            Results.Ok(new IdResponse(await repo.CreateChainAsync(req.Name))))
            .WithValidation<ChainRequest>()
            .RequireAuthorization("ChainManagement")
            .Produces<IdResponse>()
            .WithDescription("Create a new saloon chain (RootSuperAdmin only).");

        // No scoping check needed for POST/DELETE -- ChainManagement admits only RootSuperAdmin (see
        // Program.cs), which has no chain of its own to be scoped by. PUT uses ChainDetailsManagement
        // instead, which also admits a chain's own SuperAdmin, so it needs the explicit id check below.
        group.MapPut("/chains/{id:int}", async (int id, ChainUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.SuperAdmin) && currentUser.ChainId != id)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);

            await repo.UpdateChainAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<ChainUpdateRequest>().RequireAuthorization("ChainDetailsManagement")
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Rename or activate/deactivate a chain (RootSuperAdmin any chain, SuperAdmin their own).");

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

        // Admin-owns-this-location isn't checked here (PUT only carries the location id, not its
        // chain) -- accepted at the same trust level Rooms/Therapists already operate at: the location
        // id only ever reaches this handler via a dropdown that GET /locations already scoped to the
        // caller's own chain, so an Admin has no way to discover another chain's id. Manager is
        // different -- LocationDetailsManagement admits them with no chain-scoped dropdown to rely on,
        // so their own location id is checked explicitly.
        group.MapPut("/locations/{id:int}", async (int id, LocationUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != id)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            await repo.UpdateLocationAsync(
                id, req.Name, req.Address, req.OpenTime, req.CloseTime, req.WorkingDaysMask, req.TimeZoneId, req.IsActive);
            return Results.NoContent();
        }).WithValidation<LocationUpdateRequest>().RequireAuthorization("LocationDetailsManagement")
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update a location's details or active state (Manager limited to their own location).");

        group.MapDelete("/locations/{id:int}", async (int id, CatalogRepository repo) =>
        {
            await repo.DeleteLocationAsync(id);
            return Results.NoContent();
        }).RequireAuthorization("LocationManagement")
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Soft-delete a location.");

        group.MapGet("/treatment-categories", async (int locationId, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetTreatmentCategoriesAsync(locationId));
        }).Produces<IEnumerable<TreatmentCategoryDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's treatment categories.");

        group.MapPost("/treatment-categories", async (TreatmentCategoryRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(new IdResponse(await repo.CreateTreatmentCategoryAsync(req.LocationId, req.Name)));
        }).WithValidation<TreatmentCategoryRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new treatment category under a location.");

        // PUT only carries the category id, not its location -- a Manager's own category list is
        // fetched and checked for membership rather than trusting the id blind (that list is itself
        // now scoped to their location by the GET handler above).
        group.MapPut("/treatment-categories/{id:int}", async (int id, TreatmentCategoryUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId is { } locationId)
            {
                var mine = await repo.GetTreatmentCategoriesAsync(locationId);
                if (!mine.Any(c => c.Id == id))
                    return Results.Problem("Not authorized for this treatment category.", statusCode: StatusCodes.Status403Forbidden);
            }

            await repo.UpdateTreatmentCategoryAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<TreatmentCategoryUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Rename a treatment category or change its active state.");

        group.MapPost("/treatments", async (TreatmentRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(new IdResponse(
                await repo.CreateTreatmentAsync(req.LocationId, req.CategoryId, req.Name, req.DurationSlots, req.EffectiveFrom, req.Price)));
        }).WithValidation<TreatmentRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new treatment under a location/category, seeding its required first price (effective today) -- see /treatments/{id}/prices to schedule later changes.");

        // Same "fetch caller's own list, check membership" as treatment-categories PUT above --
        // TreatmentUpdateRequest carries a category id, not a location id, to check against directly.
        group.MapPut("/treatments/{id:int}", async (int id, TreatmentUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId is { } locationId)
            {
                var mine = await repo.GetTreatmentsForAdminAsync(locationId);
                if (!mine.Any(t => t.Id == id))
                    return Results.Problem("Not authorized for this treatment.", statusCode: StatusCodes.Status403Forbidden);
            }

            await repo.UpdateTreatmentAsync(id, req.CategoryId, req.Name, req.DurationSlots, req.EffectiveFrom, req.IsActive);
            return Results.NoContent();
        }).WithValidation<TreatmentUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update a treatment's details, go-live date, or active state (price is managed separately -- see /treatments/{id}/prices).");

        group.MapGet("/treatments/{id:int}/prices", async (int id, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId is { } locationId)
            {
                var mine = await repo.GetTreatmentsForAdminAsync(locationId);
                if (!mine.Any(t => t.Id == id))
                    return Results.Problem("Not authorized for this treatment.", statusCode: StatusCodes.Status403Forbidden);
            }

            return Results.Ok(await repo.GetTreatmentPricesAsync(id));
        }).Produces<IEnumerable<TreatmentPriceDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a treatment's price history, newest effective date first.");

        // Schedules a new price effective from a given date -- never edits an existing price row,
        // so past bookings stay priced at whatever was effective when they were made.
        group.MapPost("/treatments/{id:int}/prices", async (int id, TreatmentPriceRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId is { } locationId)
            {
                var mine = await repo.GetTreatmentsForAdminAsync(locationId);
                if (!mine.Any(t => t.Id == id))
                    return Results.Problem("Not authorized for this treatment.", statusCode: StatusCodes.Status403Forbidden);
            }

            return Results.Ok(new IdResponse(await repo.AddTreatmentPriceAsync(id, req.Price, req.EffectiveFrom)));
        }).WithValidation<TreatmentPriceRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Schedule a new effective-dated price for a treatment.");

        // Corrects a price's amount in place -- only while no non-cancelled booking has yet been
        // added during that price's effective window, a guard the stored proc enforces with a 409
        // on violation. Route is nested under the treatment for the same ownership check as the
        // other treatment-scoped routes, even though TreatmentPrices.Id alone is unique.
        group.MapPut("/treatments/{id:int}/prices/{priceId:int}", async (
            int id, int priceId, TreatmentPriceUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId is { } locationId)
            {
                var mine = await repo.GetTreatmentsForAdminAsync(locationId);
                if (!mine.Any(t => t.Id == id))
                    return Results.Problem("Not authorized for this treatment.", statusCode: StatusCodes.Status403Forbidden);
            }

            await repo.UpdateTreatmentPriceAsync(priceId, req.Price);
            return Results.NoContent();
        }).WithValidation<TreatmentPriceUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Correct a scheduled price's amount, if no booking has used it yet.");

        // Same clamp-not-reject convention as GET /chains -- SuperAdmin/Admin only ever see their own
        // chain's therapists, Manager only their own location's. Previously unscoped: any AdminAccess
        // caller saw and could edit every therapist in the system regardless of chain/location.
        group.MapGet("/therapists", async (ICurrentUser currentUser, CatalogRepository repo) =>
        {
            int? chainId = currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) ? currentUser.ChainId : null;
            int? locationId = currentUser.IsInRole(UserRole.Manager) ? currentUser.LocationId : null;
            return Results.Ok(await repo.GetTherapistsAsync(chainId, locationId));
        }).Produces<IEnumerable<TherapistDto>>()
          .WithDescription("List therapists visible to the caller (all for RootSuperAdmin, own chain for SuperAdmin/Admin, own location for Manager).");

        // No chain/location to scope at creation -- a therapist row starts unlinked and is only tied
        // to a chain/location once assigned to a staff login (see AdminStaffEndpoints' LinkTherapistScopeAsync calls).
        group.MapPost("/therapists", async (TherapistRequest req, CatalogRepository repo) =>
            Results.Ok(new IdResponse(await repo.CreateTherapistAsync(req.Name))))
            .WithValidation<TherapistRequest>()
            .Produces<IdResponse>()
            .WithDescription("Create a new therapist.");

        // Same "fetch caller's own list, check membership" as Rooms/Treatments PUT -- TherapistUpdateRequest
        // carries no chain/location id to check against directly.
        group.MapPut("/therapists/{id:int}", async (int id, TherapistUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin))
            {
                var mine = await repo.GetTherapistsAsync(chainId: currentUser.ChainId);
                if (!mine.Any(t => t.Id == id))
                    return Results.Problem("Not authorized for this therapist.", statusCode: StatusCodes.Status403Forbidden);
            }
            else if (currentUser.IsInRole(UserRole.Manager))
            {
                var mine = await repo.GetTherapistsAsync(locationId: currentUser.LocationId);
                if (!mine.Any(t => t.Id == id))
                    return Results.Problem("Not authorized for this therapist.", statusCode: StatusCodes.Status403Forbidden);
            }

            await repo.UpdateTherapistAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<TherapistUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update a therapist's name or active state.");

        // GET stays under the group's plain AdminAccess -- Manager/Receptionist still need the room
        // list to power the Scheduling page (room-opening).
        group.MapGet("/rooms", async (int locationId, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetRoomsAsync(locationId));
        }).Produces<IEnumerable<RoomDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's rooms.");

        // LocationDetailsManagement (not the create/delete-only LocationManagement) -- rooms belong to
        // a location the same way its name/hours do, so a location's own Manager can add/edit rooms
        // too, same trust level as PUT /locations/{id} above.
        group.MapPost("/rooms", async (RoomRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(new IdResponse(await repo.CreateRoomAsync(req.LocationId, req.Name)));
        }).WithValidation<RoomRequest>()
          .RequireAuthorization("LocationDetailsManagement")
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new room under a location.");

        // Same "fetch caller's own list, check membership" as treatment-categories/treatments PUT --
        // RoomUpdateRequest carries no location id to check against directly.
        group.MapPut("/rooms/{id:int}", async (int id, RoomUpdateRequest req, ICurrentUser currentUser, CatalogRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId is { } locationId)
            {
                var mine = await repo.GetRoomsAsync(locationId);
                if (!mine.Any(r => r.Id == id))
                    return Results.Problem("Not authorized for this room.", statusCode: StatusCodes.Status403Forbidden);
            }

            await repo.UpdateRoomAsync(id, req.Name, req.IsActive);
            return Results.NoContent();
        }).WithValidation<RoomUpdateRequest>().RequireAuthorization("LocationDetailsManagement")
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
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

internal sealed record TreatmentCategoryRequest(int LocationId, string Name);
internal sealed record TreatmentCategoryUpdateRequest(string Name, bool IsActive);

internal sealed record TreatmentRequest(
    int LocationId, int CategoryId, string Name, short DurationSlots, DateOnly EffectiveFrom, decimal Price);
internal sealed record TreatmentUpdateRequest(int CategoryId, string Name, short DurationSlots, DateOnly EffectiveFrom, bool IsActive);
internal sealed record TreatmentPriceRequest(decimal Price, DateOnly EffectiveFrom);
internal sealed record TreatmentPriceUpdateRequest(decimal Price);

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
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
    }
}

internal sealed class TreatmentCategoryUpdateRequestValidator : AbstractValidator<TreatmentCategoryUpdateRequest>
{
    public TreatmentCategoryUpdateRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
}

internal sealed class TreatmentRequestValidator : AbstractValidator<TreatmentRequest>
{
    public TreatmentRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.CategoryId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.DurationSlots).GreaterThan((short)0);
        RuleFor(x => x.EffectiveFrom).NotEmpty();
        RuleFor(x => x.Price).GreaterThan(0);
    }
}

internal sealed class TreatmentUpdateRequestValidator : AbstractValidator<TreatmentUpdateRequest>
{
    public TreatmentUpdateRequestValidator()
    {
        RuleFor(x => x.CategoryId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.DurationSlots).GreaterThan((short)0);
        RuleFor(x => x.EffectiveFrom).NotEmpty();
    }
}

internal sealed class TreatmentPriceRequestValidator : AbstractValidator<TreatmentPriceRequest>
{
    public TreatmentPriceRequestValidator()
    {
        RuleFor(x => x.Price).GreaterThan(0);
        RuleFor(x => x.EffectiveFrom).NotEmpty();
    }
}

internal sealed class TreatmentPriceUpdateRequestValidator : AbstractValidator<TreatmentPriceUpdateRequest>
{
    public TreatmentPriceUpdateRequestValidator() => RuleFor(x => x.Price).GreaterThan(0);
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
