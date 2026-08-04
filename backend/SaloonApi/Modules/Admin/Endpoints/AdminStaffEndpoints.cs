using FluentValidation;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminStaffEndpoints
{
    public static void MapAdminStaffEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/staff").RequireAuthorization("AdminAccess").WithTags("Admin Staff")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        // SuperAdmin/Admin/Manager/Receptionist are forced to their own scope regardless of what
        // they pass -- previously this endpoint returned every staff member in the system to any
        // AdminAccess caller (the same class of over-exposure fixed for chains/locations/bookings
        // earlier), letting e.g. an Admin browse another chain's Managers by name/email.
        // RootSuperAdmin gets no clamp -- it's the only role with no chain/location of its own.
        group.MapGet("", async (string? role, int? chainId, int? locationId, ICurrentUser currentUser, UserRepository repo) =>
        {
            UserRole? parsedRole = null;
            if (role is not null)
            {
                if (!Enum.TryParse<UserRole>(role, out var r))
                    return Results.Problem($"Unknown role '{role}'.", statusCode: StatusCodes.Status400BadRequest);
                parsedRole = r;
            }

            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin)) chainId = currentUser.ChainId;
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist)) locationId = currentUser.LocationId;

            return Results.Ok(await repo.GetStaffAsync(parsedRole, chainId, locationId));
        }).Produces<IReadOnlyList<StaffUserDto>>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("List staff users, scoped to the caller's own chain/location where applicable.");

        // Who may create whom: RootSuperAdmin -> anyone, anywhere, including a chain's first
        // SuperAdmin/Admin (ChainId comes straight from the request body since Root has none of its
        // own to clamp to); SuperAdmin -> Admin/Manager/Receptionist/Therapist/Other/Customer (own
        // chain); Admin -> Manager/Receptionist/Therapist/Other/Customer (own chain); Manager ->
        // Receptionist/Therapist/Other/Customer (own location); Receptionist has no staff-creation
        // rights of its own (falls through to the explicit reject below). Nothing enforced this
        // before RBAC landed -- any AdminAccess caller (including a plain Receptionist) could create
        // a brand-new SuperAdmin via this endpoint.
        // SuperAdmin/Admin/Manager's own scope is clamped server-side rather than checked-and-rejected,
        // so the adminportal form never needs to know (or guess) the caller's own chain/location id --
        // it just omits those fields for non-RootSuperAdmin creators and the server fills them in.
        group.MapPost("", async (CreateStaffRequest req, ICurrentUser currentUser, AuthService auth) =>
        {
            var role = Enum.Parse<UserRole>(req.Role);

            if (currentUser.IsInRole(UserRole.RootSuperAdmin))
            {
                // No restriction, no clamp -- Root is the only role allowed to hand out SuperAdmin
                // and picks which chain it's for via req.ChainId.
            }
            else if (currentUser.IsInRole(UserRole.SuperAdmin))
            {
                if (role is not (UserRole.Admin or UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Admin))
            {
                if (role is not (UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Manager))
            {
                if (role is not (UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { LocationId = currentUser.LocationId };
            }
            else
            {
                // Receptionist (or anything else that reaches this AdminAccess-gated group without a
                // branch above) has no staff-creation rights at all.
                return Results.Problem("Not authorized to create staff.", statusCode: StatusCodes.Status403Forbidden);
            }

            var id = await auth.CreateStaffAsync(req.Name, req.Email, req.Password, role, req.ChainId, req.LocationId, req.TherapistId);
            return Results.Ok(new IdResponse(id));
        }).WithValidation<CreateStaffRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new staff login, restricted to roles the caller is allowed to create.");

        // "Can mark admin as Emulator" is RootSuperAdmin/SuperAdmin's alone -- compare against the
        // stored value (not a blanket reject on isEmulator:true) because the adminportal always
        // round-trips the current value on every save (see this session's stale-closure fix), so an
        // Admin/Manager/Receptionist saving an unrelated field like phone on an emulator-enabled
        // Admin must still go through.
        group.MapPut("/{id:int}", async (int id, UpdateStaffRequest req, ICurrentUser currentUser, UserRepository repo) =>
        {
            var existing = await repo.GetByIdAsync(id);
            if (existing is null) return Results.NotFound();

            if (req.IsEmulator != existing.IsEmulator && !currentUser.IsInRole(UserRole.RootSuperAdmin, UserRole.SuperAdmin))
                return Results.Problem("Only Super Admin can change emulator status.", statusCode: StatusCodes.Status403Forbidden);

            await repo.UpdateStaffAsync(id, req.Name, req.Phone, req.ChainId, req.LocationId, req.TherapistId, req.IsEmulator, req.IsActive);
            return Results.NoContent();
        }).WithValidation<UpdateStaffRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .Produces(StatusCodes.Status404NotFound)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update a staff user's details, scope, or active/emulator state.");
    }
}

internal sealed record CreateStaffRequest(
    string Name, string Email, string Password, string Role, int? ChainId, int? LocationId, int? TherapistId);

// IsEmulator applies to any staff role (RootSuperAdmin/SuperAdmin/Admin/Manager/Receptionist/
// Therapist/Other) -- "all staff can act as a customer" is a deliberate product decision (see
// AuthService.EmulatorEligibleRoles).
internal sealed record UpdateStaffRequest(
    string Name, string? Phone, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive);

internal sealed class CreateStaffRequestValidator : AbstractValidator<CreateStaffRequest>
{
    public CreateStaffRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
        // RootSuperAdmin is excluded -- there's no "assign RootSuperAdmin" workflow (bootstrapped
        // only via AdminSeeder); AdminStaffEndpoints.MapPost further restricts who may create which
        // of the remaining roles (SuperAdmin/Admin/Manager/Receptionist/Therapist/Other/Customer)
        // based on the caller's own role/scope -- e.g. only RootSuperAdmin may pick SuperAdmin.
        RuleFor(x => x.Role)
            .Must(r => Enum.TryParse<UserRole>(r, out var role) && role is UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer)
            .WithMessage("Role must be one of SuperAdmin, Admin, Manager, Receptionist, Therapist, Other, Customer.");
    }
}

internal sealed class UpdateStaffRequestValidator : AbstractValidator<UpdateStaffRequest>
{
    public UpdateStaffRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}
