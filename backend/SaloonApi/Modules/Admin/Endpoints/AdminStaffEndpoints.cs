using FluentValidation;
using SaloonApi.Modules.Catalog.Infrastructure;
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

            var staff = await repo.GetStaffAsync(parsedRole, chainId, locationId);

            // Peers and anyone above the caller's own rank are invisible -- a SuperAdmin doesn't see
            // other SuperAdmins/RootSuperAdmin, an Admin doesn't see other Admins/SuperAdmin/
            // RootSuperAdmin, a Manager doesn't see other Managers/Admin/SuperAdmin/RootSuperAdmin.
            UserRole[] hiddenRoles = currentUser.Role switch
            {
                UserRole.SuperAdmin => [UserRole.RootSuperAdmin, UserRole.SuperAdmin],
                UserRole.Admin => [UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin],
                UserRole.Manager => [UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager],
                _ => []
            };
            if (hiddenRoles.Length > 0)
                staff = staff.Where(s => !hiddenRoles.Contains(s.Role)).ToList();

            return Results.Ok(staff);
        }).Produces<IReadOnlyList<StaffUserDto>>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("List staff users, scoped to the caller's own chain/location where applicable.");

        // Who may create whom: RootSuperAdmin -> anyone, anywhere, including a chain's first
        // SuperAdmin/Admin (ChainId comes straight from the request body since Root has none of its
        // own to clamp to); SuperAdmin -> Admin/Manager/Receptionist/Therapist/Other/Customer (own
        // chain); Admin -> Manager/Receptionist/Therapist/Other/Customer (own chain); Manager ->
        // Receptionist/Therapist/Other (own location) -- Customer is deliberately absent from
        // Manager's set here (RootSuperAdmin/SuperAdmin/Admin only, see AdminCustomersEndpoints'
        // CustomerManagement policy); Receptionist has no staff-creation rights of its own (falls
        // through to the explicit reject below). Nothing enforced this before RBAC landed -- any
        // AdminAccess caller (including a plain Receptionist) could create a brand-new SuperAdmin via
        // this endpoint.
        // SuperAdmin/Admin/Manager's own scope is clamped server-side rather than checked-and-rejected,
        // so the adminportal form never needs to know (or guess) the caller's own chain/location id --
        // it just omits those fields for non-RootSuperAdmin creators and the server fills them in.
        group.MapPost("", async (CreateStaffRequest req, ICurrentUser currentUser, AuthService auth, CatalogRepository catalogRepo) =>
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
                if (role is not (UserRole.Receptionist or UserRole.Therapist or UserRole.Other))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { LocationId = currentUser.LocationId, IsEmulator = false };
            }
            else
            {
                // Receptionist (or anything else that reaches this AdminAccess-gated group without a
                // branch above) has no staff-creation rights at all.
                return Results.Problem("Not authorized to create staff.", statusCode: StatusCodes.Status403Forbidden);
            }

            // A Therapist login needs a dbo.TherapistProfile row to be assignable to shifts (ShiftAssignments.TherapistId
            // is a hard FK to Therapists, not Users) -- auto-create one from the staff member's name rather than
            // forcing the admin to create it separately on the Therapists page first.
            var therapistId = req.TherapistId;
            if (role == UserRole.Therapist && therapistId is null)
                therapistId = await catalogRepo.CreateTherapistAsync(req.Name);

            var id = await auth.CreateStaffAsync(req.Name, req.Email, req.Password, role, req.ChainId, req.LocationId, therapistId, req.IsEmulator);

            if (role == UserRole.Therapist && therapistId is not null)
                await catalogRepo.LinkTherapistScopeAsync(therapistId.Value, req.ChainId, req.LocationId, id);

            return Results.Ok(new IdResponse(id));
        }).WithValidation<CreateStaffRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new staff login, restricted to roles the caller is allowed to create.");

        // "Can mark staff as Emulator" is RootSuperAdmin/SuperAdmin/Admin's -- compare against the
        // stored value (not a blanket reject on isEmulator:true) because the adminportal always
        // round-trips the current value on every save (see this session's stale-closure fix), so a
        // Manager saving an unrelated field like phone on an emulator-enabled Admin must still go
        // through.
        group.MapPut("/{id:int}", async (int id, UpdateStaffRequest req, ICurrentUser currentUser, UserRepository repo, CatalogRepository catalogRepo) =>
        {
            var existing = await repo.GetByIdAsync(id);
            if (existing is null) return Results.NotFound();

            if (req.IsEmulator != existing.IsEmulator && !currentUser.IsInRole(UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin))
                return Results.Problem("Only Super Admin or Admin can change emulator status.", statusCode: StatusCodes.Status403Forbidden);

            // Who may edit whom mirrors POST's creation matrix above (RootSuperAdmin edits anyone,
            // SuperAdmin edits Admin/Manager/Receptionist/Therapist/Other/Customer in their own chain,
            // Admin edits Manager/Receptionist/Therapist/Other/Customer in their own chain, Manager
            // edits Receptionist/Therapist/Other/Customer in their own location). Nothing enforced
            // this before -- any AdminAccess caller could PUT any staff id in the system and reassign
            // role/chain/location/active state freely, including promoting a Receptionist straight to
            // SuperAdmin, or editing a staff member in a chain/location they have no relation to.
            var newRole = req.Role is null ? existing.Role : Enum.Parse<UserRole>(req.Role);

            if (currentUser.IsInRole(UserRole.RootSuperAdmin))
            {
                // No restriction -- Root can edit anyone, any role reassignment.
            }
            else if (currentUser.IsInRole(UserRole.SuperAdmin))
            {
                // Manager/Receptionist/Therapist/Other targets carry LocationId, not ChainId (see
                // dbo.Users) -- their chain isn't cheaply checkable here, so (same trust level already
                // accepted for Admin's location/room/treatment endpoints elsewhere in this file) only
                // ChainId-bearing targets get an explicit chain-ownership check.
                if (existing.ChainId is not null && existing.ChainId != currentUser.ChainId)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                if (existing.Role is UserRole.RootSuperAdmin or UserRole.SuperAdmin || newRole is UserRole.RootSuperAdmin or UserRole.SuperAdmin)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Admin))
            {
                if (existing.ChainId is not null && existing.ChainId != currentUser.ChainId)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                if (existing.Role is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin
                    || newRole is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }
            else if (currentUser.IsInRole(UserRole.Manager))
            {
                if (existing.LocationId != currentUser.LocationId)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                if (existing.Role is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager
                    || newRole is UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager)
                    return Results.Problem("Not authorized to edit this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { LocationId = currentUser.LocationId };
            }
            else
            {
                return Results.Problem("Not authorized to edit staff.", statusCode: StatusCodes.Status403Forbidden);
            }

            await repo.UpdateStaffAsync(id, req.Name, req.Phone, req.Role, req.ChainId, req.LocationId, req.TherapistId, req.IsEmulator, req.IsActive);

            // Keep the linked dbo.TherapistProfile row's Name/IsActive/scope in step with the staff
            // login that owns it -- otherwise editing/deactivating/moving a Therapist here silently
            // leaves a stale profile behind (wrong name, still-active, or still scoped to their old
            // chain/location) that keeps showing up in scheduling.
            var therapistId = req.TherapistId ?? existing.TherapistId;
            if (therapistId is not null)
            {
                await catalogRepo.UpdateTherapistAsync(therapistId.Value, req.Name, req.IsActive);
                await catalogRepo.LinkTherapistScopeAsync(therapistId.Value, req.ChainId, req.LocationId, id);
            }

            return Results.NoContent();
        }).WithValidation<UpdateStaffRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .Produces(StatusCodes.Status404NotFound)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update a staff user's details, role, scope, or active/emulator state.");
    }
}

// IsEmulator: RootSuperAdmin/SuperAdmin/Admin may set this true at creation time (Manager is
// clamped to false regardless of what's sent, see MapPost's Manager branch) -- same three roles
// allowed to flip it on an existing staff member via PUT below.
internal sealed record CreateStaffRequest(
    string Name, string Email, string Password, string Role, int? ChainId, int? LocationId, int? TherapistId,
    bool IsEmulator = false);

// IsEmulator applies to any staff role (RootSuperAdmin/SuperAdmin/Admin/Manager/Receptionist/
// Therapist/Other) -- "all staff can act as a customer" is a deliberate product decision (see
// AuthService.EmulatorEligibleRoles).
internal sealed record UpdateStaffRequest(
    string Name, string? Phone, string? Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive);

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
        // RootSuperAdmin excluded same as CreateStaffRequestValidator -- no "reassign to RootSuperAdmin"
        // workflow. A malformed/unknown role would otherwise reach UpdateStaffAsync and fail as a raw,
        // unhandled SQL error against dbo.Users' Role CHECK constraint instead of a clean 400.
        RuleFor(x => x.Role)
            .Must(r => r is null || (Enum.TryParse<UserRole>(r, out var role) && role is UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager or UserRole.Receptionist or UserRole.Therapist or UserRole.Other or UserRole.Customer))
            .WithMessage("Role must be one of SuperAdmin, Admin, Manager, Receptionist, Therapist, Other, Customer.");
    }
}
