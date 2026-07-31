using FluentValidation;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Identity.Endpoints;

internal static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        // Public self-registration -- always creates a Role=Customer login. Staff accounts are
        // created by an admin via /api/admin/staff, not here.
        group.MapPost("/register", async (RegisterRequest req, AuthService auth) =>
        {
            var (id, token) = await auth.RegisterAsync(req.Name, req.Email, req.Password, req.Phone);
            return Results.Ok(new AuthResponse(id, req.Name, req.Email, "Customer", token));
        }).WithValidation<RegisterRequest>();

        // Shared by every role -- clientportal and adminportal both hit this; the returned Role
        // is what the adminportal uses to decide which routes/nav items to show. CanEmulate only
        // means anything for SuperAdmin/Admin/Manager (see dbo.Users.IsEmulator) -- the adminportal
        // uses it to show/hide the "Customers" (emulate) nav item.
        group.MapPost("/login", async (LoginRequest req, AuthService auth) =>
        {
            var result = await auth.LoginAsync(req.Email, req.Password);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(new AuthResponse(
                    result.Value.Id, result.Value.Name, req.Email, result.Value.Role.ToString(), result.Value.Token,
                    result.Value.CanEmulate));
        }).WithValidation<LoginRequest>();

        // Admin-as-customer emulation. Only reachable by SuperAdmin/Admin/Manager (AdminAccess
        // policy) -- AuthService.EmulateCustomerAsync additionally requires the caller's
        // dbo.Users.IsEmulator flag to be set, re-checked fresh from the database on every call.
        // Returns a normal customer AuthResponse (Role=Customer) so the clientportal's existing
        // login flow can consume it unchanged; IsEmulated/EmulatedByName flag it as a staff session.
        group.MapPost("/emulate/{customerId:int}", async (int customerId, AuthService auth, ICurrentUser currentUser) =>
        {
            var result = await auth.EmulateCustomerAsync(currentUser.RequireUserId(), customerId);
            return result is null
                ? Results.Problem("Not authorized to emulate this customer.", statusCode: StatusCodes.Status403Forbidden)
                : Results.Ok(new AuthResponse(
                    result.Value.Id, result.Value.Name, result.Value.Email, nameof(UserRole.Customer), result.Value.Token,
                    CanEmulate: false, IsEmulated: true, EmulatedByName: currentUser.Email));
        }).RequireAuthorization("AdminAccess");

        // Lets a freshly-emulated clientportal session (which only has a bearer token, handed to it
        // via a cross-origin redirect from the adminportal) recover its own profile and impersonation
        // banner without the admin having to smuggle that data through the redirect URL.
        group.MapGet("/me", async (ICurrentUser currentUser, UserRepository repo) =>
        {
            var me = await repo.GetByIdAsync(currentUser.RequireUserId());
            if (me is null) return Results.Unauthorized();

            string? emulatedByName = null;
            if (currentUser.EmulatedByUserId is { } emulatorId)
                emulatedByName = (await repo.GetByIdAsync(emulatorId))?.Name;

            return Results.Ok(new AuthResponse(
                me.Id, me.Name, me.Email, me.Role.ToString(), Token: "",
                CanEmulate: me.IsEmulator, IsEmulated: currentUser.EmulatedByUserId is not null, EmulatedByName: emulatedByName));
        }).RequireAuthorization();
    }
}

internal sealed record RegisterRequest(string Name, string Email, string Password, string? Phone);
internal sealed record LoginRequest(string Email, string Password);

internal sealed record AuthResponse(
    int UserId, string Name, string Email, string Role, string Token,
    bool CanEmulate = false, bool IsEmulated = false, string? EmulatedByName = null);

internal sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}

internal sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}
