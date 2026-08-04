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
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        // Public self-registration -- always creates a Role=Customer login. Staff accounts are
        // created by an admin via /api/admin/staff, not here.
        group.MapPost("/register", async (RegisterRequest req, AuthService auth) =>
        {
            var (id, token, refreshToken) = await auth.RegisterAsync(req.Name, req.Email, req.Password, req.Phone);
            return Results.Ok(new AuthResponse(id, req.Name, req.Email, "Customer", token, RefreshToken: refreshToken));
        }).WithValidation<RegisterRequest>()
          .Produces<AuthResponse>()
          .WithDescription("Self-register a new Customer account.");

        // Shared by every role -- clientportal and adminportal both hit this; the returned Role
        // is what the adminportal uses to decide which routes/nav items to show. CanEmulate only
        // means anything for staff rows with IsEmulator=1 (any staff role, see dbo.Users.IsEmulator)
        // -- the adminportal uses it to show/hide the "Customers" (emulate) nav item.
        group.MapPost("/login", async (LoginRequest req, AuthService auth) =>
        {
            var result = await auth.LoginAsync(req.Email, req.Password);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(new AuthResponse(
                    result.Value.Id, result.Value.Name, req.Email, result.Value.Role.ToString(), result.Value.Token,
                    result.Value.CanEmulate, RefreshToken: result.Value.RefreshToken));
        }).WithValidation<LoginRequest>()
          .Produces<AuthResponse>()
          .Produces(StatusCodes.Status401Unauthorized)
          .WithDescription("Log in with email/password, returning an access token and refresh token.");

        // Exchanges a refresh token for a new access/refresh pair once the access token has expired --
        // lets the frontend silently re-auth instead of forcing a full re-login. No [Authorize]: the
        // refresh token itself (an unguessable, hashed-at-rest opaque secret) is the credential here,
        // same trust model as a password -- there's no bearer token left to authorize against once
        // the access token has expired, which is the whole reason this endpoint exists.
        group.MapPost("/refresh", async (RefreshRequest req, AuthService auth) =>
        {
            var result = await auth.RefreshAsync(req.RefreshToken);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(new AuthResponse(
                    result.Value.Id, result.Value.Name, result.Value.Email, result.Value.Role.ToString(), result.Value.Token,
                    result.Value.CanEmulate, RefreshToken: result.Value.RefreshToken));
        }).WithValidation<RefreshRequest>()
          .Produces<AuthResponse>()
          .Produces(StatusCodes.Status401Unauthorized)
          .WithDescription("Exchange a refresh token for a new access/refresh pair (rotates the old one).");

        // Revokes the refresh token server-side on sign-out -- without this, a token copied off the
        // device before logout would stay redeemable at /api/auth/refresh indefinitely.
        group.MapPost("/logout", async (RefreshRequest req, AuthService auth) =>
        {
            await auth.LogoutAsync(req.RefreshToken);
            return Results.Ok();
        }).WithValidation<RefreshRequest>()
          .WithDescription("Revoke a refresh token on sign-out.");

        // Staff-as-customer emulation. Reachable by any staff role (StaffAccess policy, now including
        // Manager) -- "all staff can be a customer" is a deliberate product decision -- but
        // AuthService.EmulateCustomerAsync
        // additionally requires the caller's dbo.Users.IsEmulator flag to be set, re-checked fresh
        // from the database on every call, so StaffAccess alone doesn't grant emulation.
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
        }).RequireAuthorization("StaffAccess")
          .Produces<AuthResponse>()
          .ProducesProblem(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Exchange the caller's staff session for a Customer session, acting on their behalf.");

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
        }).RequireAuthorization()
          .Produces<AuthResponse>()
          .Produces(StatusCodes.Status401Unauthorized)
          .WithDescription("Get the caller's own profile and impersonation banner state.");
    }
}

internal sealed record RegisterRequest(string Name, string Email, string Password, string? Phone);
internal sealed record LoginRequest(string Email, string Password);
internal sealed record RefreshRequest(string RefreshToken);

internal sealed record AuthResponse(
    int UserId, string Name, string Email, string Role, string Token,
    bool CanEmulate = false, bool IsEmulated = false, string? EmulatedByName = null, string RefreshToken = "");

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

internal sealed class RefreshRequestValidator : AbstractValidator<RefreshRequest>
{
    public RefreshRequestValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty();
    }
}
