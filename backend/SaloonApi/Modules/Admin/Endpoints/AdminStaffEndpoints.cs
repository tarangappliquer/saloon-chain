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
        var group = app.MapGroup("/api/admin/staff").RequireAuthorization("AdminAccess");

        group.MapGet("", async (string? role, int? chainId, int? locationId, UserRepository repo) =>
        {
            var parsedRole = role is not null ? Enum.Parse<UserRole>(role) : (UserRole?)null;
            return Results.Ok(await repo.GetStaffAsync(parsedRole, chainId, locationId));
        });

        group.MapPost("", async (CreateStaffRequest req, AuthService auth) =>
        {
            var role = Enum.Parse<UserRole>(req.Role);
            var id = await auth.CreateStaffAsync(req.Name, req.Email, req.Password, role, req.ChainId, req.LocationId, req.TherapistId);
            return Results.Ok(new { Id = id });
        }).WithValidation<CreateStaffRequest>();

        group.MapPut("/{id:int}", async (int id, UpdateStaffRequest req, UserRepository repo) =>
        {
            await repo.UpdateStaffAsync(id, req.Name, req.Phone, req.ChainId, req.LocationId, req.TherapistId, req.IsEmulator, req.IsActive);
            return Results.NoContent();
        }).WithValidation<UpdateStaffRequest>();
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
        RuleFor(x => x.Role)
            .Must(r => Enum.TryParse<UserRole>(r, out var role) && role != UserRole.Customer)
            .WithMessage("Role must be one of SuperAdmin, Admin, Manager, Therapist.");
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
