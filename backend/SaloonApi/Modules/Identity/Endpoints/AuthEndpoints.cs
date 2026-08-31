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
        // means anything for staff rows with IsEmulator=1 (any staff role, see Users.IsEmulator)
        // -- the adminportal uses it to show/hide the "Customers" (emulate) nav item.
        //
        // Portal is an optional, backward-compatible hint (clientportal/self-registration never send
        // it): "Admin" restricts a successful login to RootSuperAdmin/SuperAdmin/Admin/Manager,
        // rejecting Receptionist/Therapist/Other/Customer even with correct credentials -- moved here
        // from a frontend-only check in adminportal's AuthContext, which only stopped the UI from
        // storing the session, not the API from issuing a perfectly usable token for it.
        group.MapPost("/login", async (LoginRequest req, AuthService auth) =>
        {
            var result = await auth.LoginAsync(req.Email, req.Password);
            if (result is null)
                return Results.Problem("Invalid email or password.", statusCode: StatusCodes.Status401Unauthorized);

            if (req.Portal == "Admin" && result.Value.Role is not (UserRole.RootSuperAdmin or UserRole.SuperAdmin or UserRole.Admin or UserRole.Manager))
                return Results.Problem("This account is not authorized for the admin portal.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(new AuthResponse(
                result.Value.Id, result.Value.Name, req.Email, result.Value.Role.ToString(), result.Value.Token,
                result.Value.CanEmulate, RefreshToken: result.Value.RefreshToken, PhotoPath: result.Value.PhotoPath,
                IsEmailVerified: result.Value.IsEmailVerified));
        }).WithValidation<LoginRequest>()
          .Produces<AuthResponse>()
          .Produces(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
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
                    result.Value.CanEmulate, RefreshToken: result.Value.RefreshToken,
                    IsEmailVerified: result.Value.IsEmailVerified));
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

        // Always 200, whether or not the email is registered -- a differing response would let a
        // caller enumerate which emails have accounts (AuthService.RequestPasswordResetAsync is
        // itself a silent no-op when the email isn't found, same shape as LogoutAsync above).
        group.MapPost("/forgot-password", async (ForgotPasswordRequest req, AuthService auth) =>
        {
            await auth.RequestPasswordResetAsync(req.Email);
            return Results.Ok();
        }).WithValidation<ForgotPasswordRequest>()
          .WithDescription("Request a password-reset email. Always succeeds, whether or not the email is registered.");

        // No [Authorize]: same trust model as /refresh -- the reset token itself (unguessable,
        // hashed-at-rest, single-use) is the credential, not a bearer session (the caller doesn't
        // have one yet, that's the whole point of forgot-password).
        group.MapPost("/reset-password", async (ResetPasswordRequest req, AuthService auth) =>
        {
            var ok = await auth.ResetPasswordAsync(req.Token, req.NewPassword);
            return ok
                ? Results.Ok()
                : Results.Problem("This reset link is invalid or has expired.", statusCode: StatusCodes.Status400BadRequest);
        }).WithValidation<ResetPasswordRequest>()
          .Produces(StatusCodes.Status200OK)
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Redeem a password-reset token to set a new password.");

        // No [Authorize]: same trust model as /reset-password -- the token itself (unguessable,
        // hashed-at-rest, single-use, mailed only to the address being claimed) is the credential.
        // Deliberately not under the authenticated /api/profile group either, since the browser
        // clicking this link may not be signed in as this user (or signed in at all).
        group.MapPost("/email/confirm", async (ConfirmEmailChangeRequest req, AuthService auth) =>
        {
            var ok = await auth.ConfirmEmailChangeAsync(req.Token);
            return ok
                ? Results.Ok()
                : Results.Problem("This confirmation link is invalid or has expired.", statusCode: StatusCodes.Status400BadRequest);
        }).WithValidation<ConfirmEmailChangeRequest>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Confirm a pending email change using the token mailed to the new address.");

        // Staff-as-customer emulation. Reachable by any staff role (StaffAccess policy, now including
        // Manager) -- "all staff can be a customer" is a deliberate product decision -- but
        // AuthService.EmulateCustomerAsync
        // additionally requires the caller's Users.IsEmulator flag to be set, re-checked fresh
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
                    CanEmulate: false, IsEmulated: true, EmulatedByName: currentUser.Email,
                    // Skip the email-verification gate for emulated sessions -- the staff member already
                    // authenticated properly; a customer's own unverified email shouldn't block support access.
                    IsEmailVerified: true,
                    // currentUser here is still the staff caller (token swap hasn't happened yet), so
                    // these are read straight off their claims -- lets clientportal scope the saloon/
                    // location picker to what this emulator is actually allowed to book at.
                    EmulatorChainId: currentUser.ChainId, EmulatorLocationId: currentUser.LocationId));
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
            int? emulatorChainId = null;
            int? emulatorLocationId = null;
            if (currentUser.EmulatedByUserId is { } emulatorId)
            {
                var emulator = await repo.GetByIdAsync(emulatorId);
                emulatedByName = emulator?.Name;
                emulatorChainId = emulator?.ChainId;
                emulatorLocationId = emulator?.LocationId;
            }

            bool isEmulated = currentUser.EmulatedByUserId is not null;
            bool canEmulate = me.Role.CanAlwaysEmulate() || me.IsEmulator;
            return Results.Ok(new AuthResponse(
                me.Id, me.Name, me.Email, me.Role.ToString(), Token: "",
                CanEmulate: canEmulate, IsEmulated: isEmulated, EmulatedByName: emulatedByName,
                PhotoPath: me.PhotoPath, IsEmailVerified: me.IsEmailVerified || isEmulated,
                EmulatorChainId: emulatorChainId, EmulatorLocationId: emulatorLocationId));
        }).RequireAuthorization()
          .Produces<AuthResponse>()
          .Produces(StatusCodes.Status401Unauthorized)
          .WithDescription("Get the caller's own profile and impersonation banner state.");
    }
}

internal sealed record RegisterRequest(string Name, string Email, string Password, string? Phone);
internal sealed record LoginRequest(string Email, string Password, string? Portal = null);
internal sealed record RefreshRequest(string RefreshToken);
internal sealed record ForgotPasswordRequest(string Email);
internal sealed record ResetPasswordRequest(string Token, string NewPassword);
internal sealed record ConfirmEmailChangeRequest(string Token);

internal sealed record AuthResponse(
    int UserId, string Name, string Email, string Role, string Token,
    bool CanEmulate = false, bool IsEmulated = false, string? EmulatedByName = null, string RefreshToken = "",
    string? PhotoPath = null, bool IsEmailVerified = false,
    // Only meaningful when IsEmulated -- the emulating staff member's own chain/location scope, not
    // the emulated customer's. Lets clientportal restrict the saloon/location picker to what that
    // staff member is actually authorized to book at (see BookingEndpoints' matching enforcement).
    int? EmulatorChainId = null, int? EmulatorLocationId = null);

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

internal sealed class ForgotPasswordRequestValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}

internal sealed class ConfirmEmailChangeRequestValidator : AbstractValidator<ConfirmEmailChangeRequest>
{
    public ConfirmEmailChangeRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty();
    }
}

internal sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8);
    }
}
