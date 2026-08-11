using FluentValidation;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminCustomersEndpoints
{
    // Read scope for list/search/notes/tags: SuperAdmin/Admin see their whole chain,
    // Manager/Receptionist see only their own location, RootSuperAdmin sees everything.
    private static (int? ChainId, int? LocationId) ResolveReadScope(ICurrentUser currentUser)
    {
        if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin)) return (currentUser.ChainId, null);
        if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager, UserRole.Receptionist)) return (null, currentUser.LocationId);
        return (null, null);
    }

    // Write scope for a new note/tag: Manager/Receptionist are always pinned to their own location
    // regardless of what's requested (they have no chain-wide standing to create a saloon-wide
    // note). SuperAdmin/Admin can target a specific location in their chain, or write chain-wide by
    // leaving LocationId unset. RootSuperAdmin has neither a chain nor a location of their own, so
    // must say explicitly which one they mean.
    private static async Task<(int? ChainId, int? LocationId, IResult? Error)> ResolveWriteScopeAsync(
        ICurrentUser currentUser, int? requestedChainId, int? requestedLocationId, UserRepository userRepo)
    {
        if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist))
            return (null, currentUser.LocationId, null);

        if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin))
        {
            if (requestedLocationId is { } locId)
            {
                if (currentUser.ChainId is null || !await userRepo.IsLocationInChainAsync(locId, currentUser.ChainId.Value))
                    return (null, null, Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden));
                return (null, locId, null);
            }
            return (currentUser.ChainId, null, null);
        }

        // RootSuperAdmin
        if (requestedLocationId is { } rootLocId) return (null, rootLocId, null);
        if (requestedChainId is { } rootChainId) return (rootChainId, null, null);
        return (null, null, Results.Problem("Specify a chainId or locationId.", statusCode: StatusCodes.Status400BadRequest));
    }

    public static void MapAdminCustomersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/customers").RequireAuthorization("StaffAccess").WithTags("Admin Customers")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        // Backs the adminportal's emulation picker -- search only (no "list everyone" use case),
        // same StaffAccess gate as the emulate exchange itself in AuthEndpoints (any staff role can
        // be emulator-eligible, see AuthService.EmulatorEligibleRoles).
        group.MapGet("/search", async (string q, ICurrentUser currentUser, UserRepository repo) =>
        {
            var (chainId, locationId) = ResolveReadScope(currentUser);
            return Results.Ok(await repo.SearchCustomersAsync(q, chainId, locationId));
        })
        .Produces<IReadOnlyList<CustomerSummaryDto>>()
        .WithDescription("Search customers by name/email for the emulation picker.");

        // Full roster (inactive included, no row cap on the underlying result -- keyset-paginated
        // instead, see sp_Admin_GetCustomers) for the Customers management page --
        // RootSuperAdmin/SuperAdmin/Admin/Manager (Receptionist/Therapist/Other can't reach
        // adminportal at all since the portal login gate, but AdminAccess is layered here too for
        // defense in depth, same as everywhere else in this file's sibling endpoints).
        group.MapGet("", async (string? search, int? pageSize, string? cursorName, int? cursorId, ICurrentUser currentUser, UserRepository repo) =>
        {
            var (chainId, locationId) = ResolveReadScope(currentUser);
            return Results.Ok(await repo.GetCustomersForAdminAsync(search, chainId, locationId, pageSize ?? 50, cursorName, cursorId));
        })
        .RequireAuthorization("AdminAccess")
        .Produces<AdminCustomersPageDto>()
        .WithDescription("List customers, including inactive, for admin management -- keyset-paginated by Name/Id for infinite scroll.");

        // CustomerManagement, not AdminAccess -- Manager may edit/delete/view a customer but not
        // create one (see Program.cs's CustomerManagement policy).
        group.MapPost("", async (CreateCustomerRequest req, AuthService auth) =>
            Results.Ok(new IdResponse(await auth.CreateCustomerAsync(req.Name, req.Email, req.Phone, req.IsWalkIn))))
            .WithValidation<CreateCustomerRequest>()
            .RequireAuthorization("StaffAccess")
            .Produces<IdResponse>()
            .WithDescription("Create a new customer account or walk-in customer profile (RootSuperAdmin/SuperAdmin/Admin/Manager/Receptionist).");

        group.MapPut("/{id:int}", async (int id, UpdateCustomerRequest req, UserRepository repo, SaloonApi.Modules.Payment.Application.StripeCustomerService stripeCustomerService) =>
        {
            await repo.UpdateCustomerAsync(id, req.Name, req.Phone, req.IsActive);
            var user = await repo.GetByIdAsync(id);
            if (user is not null)
            {
                await stripeCustomerService.SyncCustomerAsync(id, req.Name, user.Email, req.Phone);
            }
            return Results.NoContent();
        }).WithValidation<UpdateCustomerRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Update a customer's name/phone/active state.");

        group.MapDelete("/{id:int}", async (int id, UserRepository repo) =>
        {
            await repo.DeleteCustomerAsync(id);
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Soft-delete a customer account.");

        // Client profile detail page: name/email/phone/status in one call, notes/tags/visit-history
        // fetched separately below so the page can render each section independently.
        group.MapGet("/{id:int}/profile", async (int id, UserRepository repo) =>
        {
            var profile = await repo.GetCustomerProfileAsync(id);
            return profile is null ? Results.NotFound() : Results.Ok(profile);
        }).Produces<CustomerProfileDto>()
          .ProducesProblem(StatusCodes.Status404NotFound)
          .WithDescription("Get a customer's profile detail for the client record page.");

        group.MapGet("/{id:int}/notes", async (int id, ICurrentUser currentUser, UserRepository repo) =>
        {
            var (chainId, locationId) = ResolveReadScope(currentUser);
            return Results.Ok(await repo.GetCustomerNotesAsync(id, chainId, locationId));
        }).Produces<IReadOnlyList<CustomerNoteDto>>()
          .WithDescription("List a customer's notes visible at the caller's chain/location scope.");

        group.MapPost("/{id:int}/notes", async (int id, AddCustomerNoteRequest req, ICurrentUser currentUser, UserRepository repo) =>
        {
            var (chainId, locationId, error) = await ResolveWriteScopeAsync(currentUser, req.ChainId, req.LocationId, repo);
            if (error is not null) return error;

            var noteId = await repo.AddCustomerNoteAsync(id, chainId, locationId, req.Note);
            return Results.Ok(new IdResponse(noteId));
        }).WithValidation<AddCustomerNoteRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Add a note to a customer's record, scoped to a location or saloon-wide.");

        group.MapDelete("/{id:int}/notes/{noteId:int}", async (int id, int noteId, UserRepository repo) =>
        {
            await repo.DeleteCustomerNoteAsync(noteId);
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Delete a customer note.");

        group.MapGet("/{id:int}/tags", async (int id, ICurrentUser currentUser, UserRepository repo) =>
        {
            var (chainId, locationId) = ResolveReadScope(currentUser);
            return Results.Ok(await repo.GetCustomerTagsAsync(id, chainId, locationId));
        }).Produces<IReadOnlyList<CustomerTagDto>>()
          .WithDescription("List a customer's tags visible at the caller's chain/location scope.");

        group.MapPost("/{id:int}/tags", async (int id, AddCustomerTagRequest req, ICurrentUser currentUser, UserRepository repo) =>
        {
            var (chainId, locationId, error) = await ResolveWriteScopeAsync(currentUser, req.ChainId, req.LocationId, repo);
            if (error is not null) return error;

            var tagId = await repo.AddCustomerTagAsync(id, chainId, locationId, req.Tag);
            return Results.Ok(new IdResponse(tagId));
        }).WithValidation<AddCustomerTagRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Add a tag to a customer's record, scoped to a location or saloon-wide.");

        group.MapDelete("/{id:int}/tags/{tagId:int}", async (int id, int tagId, UserRepository repo) =>
        {
            await repo.DeleteCustomerTagAsync(tagId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Remove a tag from a customer's record.");

        // Visit history reuses the exact same query the customer's own "My Bookings" page runs
        // (BookingService.GetMineAsync) -- it already takes an arbitrary customerId, it just always
        // received the caller's own id before now.
        group.MapGet("/{id:int}/bookings", async (int id, ICurrentUser currentUser, BookingService bookingSvc) =>
        {
            var (chainId, locationId) = ResolveReadScope(currentUser);
            return Results.Ok(await bookingSvc.GetMineAsync(id, chainId, locationId));
        }).Produces<IReadOnlyList<MyBookingDto>>()
          .WithDescription("List a customer's visit history at the caller's chain/location scope.");
    }
}

// No Password field -- see CreateStaffRequest's equivalent comment in AdminStaffEndpoints.cs.
internal sealed record CreateCustomerRequest(string Name, string? Email, string? Phone, bool IsWalkIn = false);
internal sealed record UpdateCustomerRequest(string Name, string? Phone, bool IsActive);

internal sealed class CreateCustomerRequestValidator : AbstractValidator<CreateCustomerRequest>
{
    public CreateCustomerRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Email).NotEmpty().When(x => !x.IsWalkIn).WithMessage("Email is required for standard registered customers.");
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrEmpty(x.Email)).MaximumLength(256);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}

internal sealed class UpdateCustomerRequestValidator : AbstractValidator<UpdateCustomerRequest>
{
    public UpdateCustomerRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}

// ChainId/LocationId: leave both null for "my default scope" (own location for Manager/
// Receptionist, own chain for SuperAdmin/Admin); set LocationId to target one specific location as
// SuperAdmin/Admin; RootSuperAdmin must set exactly one. See ResolveWriteScopeAsync.
internal sealed record AddCustomerNoteRequest(string Note, int? ChainId = null, int? LocationId = null);
internal sealed record AddCustomerTagRequest(string Tag, int? ChainId = null, int? LocationId = null);

internal sealed class AddCustomerNoteRequestValidator : AbstractValidator<AddCustomerNoteRequest>
{
    public AddCustomerNoteRequestValidator()
    {
        RuleFor(x => x.Note).NotEmpty().MaximumLength(4000);
    }
}

internal sealed class AddCustomerTagRequestValidator : AbstractValidator<AddCustomerTagRequest>
{
    public AddCustomerTagRequestValidator()
    {
        RuleFor(x => x.Tag).NotEmpty().MaximumLength(100);
    }
}
