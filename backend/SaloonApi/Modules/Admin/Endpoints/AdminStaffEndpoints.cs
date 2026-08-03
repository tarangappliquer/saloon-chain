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

        // Admin/Manager are forced to their own scope regardless of what they pass -- previously
        // this endpoint returned every staff member in the system to any AdminAccess caller (the
        // same class of over-exposure fixed for chains/locations/bookings earlier), letting e.g. an
        // Admin browse another chain's Managers by name/email.
        group.MapGet("", async (string? role, int? chainId, int? locationId, ICurrentUser currentUser, UserRepository repo) =>
        {
            UserRole? parsedRole = null;
            if (role is not null)
            {
                if (!Enum.TryParse<UserRole>(role, out var r))
                    return Results.Problem($"Unknown role '{role}'.", statusCode: StatusCodes.Status400BadRequest);
                parsedRole = r;
            }

            if (currentUser.IsInRole(UserRole.Admin)) chainId = currentUser.ChainId;
            if (currentUser.IsInRole(UserRole.Manager)) locationId = currentUser.LocationId;

            return Results.Ok(await repo.GetStaffAsync(parsedRole, chainId, locationId));
        }).Produces<IReadOnlyList<StaffUserDto>>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("List staff users, scoped to the caller's own chain/location where applicable.");

        // Who may create whom: SuperAdmin -> Admin/Manager/Therapist (anywhere); Admin -> Manager/
        // Therapist within their own chain; Manager -> Therapist within their own location. Nothing
        // enforced this before -- any AdminAccess caller (including a plain Manager) could create a
        // brand-new SuperAdmin via this endpoint.
        // Admin/Manager's own scope is clamped server-side rather than checked-and-rejected, so the
        // adminportal form never needs to know (or guess) the caller's own chain/location id -- it
        // just omits those fields for non-SuperAdmin creators and the server fills them in.
        group.MapPost("", async (CreateStaffRequest req, ICurrentUser currentUser, AuthService auth) =>
        {
            var role = Enum.Parse<UserRole>(req.Role);

            if (currentUser.IsInRole(UserRole.Admin))
            {
                if (role is not (UserRole.Manager or UserRole.Therapist))
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { ChainId = currentUser.ChainId };
            }

            if (currentUser.IsInRole(UserRole.Manager))
            {
                if (role != UserRole.Therapist)
                    return Results.Problem("Not authorized to create this staff member.", statusCode: StatusCodes.Status403Forbidden);
                req = req with { LocationId = currentUser.LocationId };
            }

            var id = await auth.CreateStaffAsync(req.Name, req.Email, req.Password, role, req.ChainId, req.LocationId, req.TherapistId);
            return Results.Ok(new IdResponse(id));
        }).WithValidation<CreateStaffRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new staff login, restricted to roles the caller is allowed to create.");

        // "Can mark admin as Emulator" is Super Admin's alone -- compare against the stored value
        // (not a blanket reject on isEmulator:true) because the adminportal always round-trips the
        // current value on every save (see this session's stale-closure fix), so an Admin/Manager
        // saving an unrelated field like phone on an emulator-enabled Admin must still go through.
        group.MapPut("/{id:int}", async (int id, UpdateStaffRequest req, ICurrentUser currentUser, UserRepository repo) =>
        {
            var existing = await repo.GetByIdAsync(id);
            if (existing is null) return Results.NotFound();

            if (req.IsEmulator != existing.IsEmulator && !currentUser.IsInRole(UserRole.SuperAdmin))
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

// IsEmulator only makes sense for SuperAdmin/Admin/Manager rows -- setting it on a Therapist is
// harmless (sp_Admin_UpdateUser never touches Therapist/Customer anyway) but the adminportal form
// only exposes the toggle for those three roles.
internal sealed record UpdateStaffRequest(
    string Name, string? Phone, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive);

internal sealed class CreateStaffRequestValidator : AbstractValidator<CreateStaffRequest>
{
    public CreateStaffRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
        // SuperAdmin is excluded too -- there's no "assign SuperAdmin" workflow (bootstrapped only
        // via AdminSeeder); AdminStaffEndpoints.MapPost further restricts who may create which of
        // the remaining roles (Admin/Manager/Therapist) based on the caller's own role/scope.
        RuleFor(x => x.Role)
            .Must(r => Enum.TryParse<UserRole>(r, out var role) && role is UserRole.Admin or UserRole.Manager or UserRole.Therapist)
            .WithMessage("Role must be one of Admin, Manager, Therapist.");
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
