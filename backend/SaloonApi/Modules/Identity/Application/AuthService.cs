using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Email;

namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthService(
    UserRepository repo, RefreshTokenRepository refreshTokens, PasswordResetTokenRepository resetTokens,
    TokenService tokens, IBackgroundEmailQueue emailQueue, IOptions<PortalUrlOptions> portalUrls)
{
    // "Set your password" (new account, less urgent) gets a longer window than "forgot password"
    // (an active account-recovery request) -- both intentionally short compared to RefreshTokenExpiryDays.
    private const int SetPasswordExpiryHours = 72;
    private const int ForgotPasswordExpiryHours = 1;

    public async Task<(int Id, string Token, string RefreshToken)> RegisterAsync(string name, string email, string password, string? phone)
    {
        var (hash, salt) = PasswordHasher.Hash(password);
        // Self-registration is always Role=Customer -- staff accounts are created only via the
        // admin-only CreateStaffAsync path below, never through this public endpoint.
        var id = await repo.CreateAsync(name, email, hash, salt, phone);
        var (accessToken, refreshToken) = await IssueTokensAsync(id, email, UserRole.Customer);
        return (id, accessToken, refreshToken);
    }

    public async Task<(int Id, string Name, UserRole Role, bool CanEmulate, string Token, string RefreshToken)?> LoginAsync(string email, string password)
    {
        var user = await repo.GetByEmailAsync(email);
        if (user is null || !PasswordHasher.Verify(password, user.PasswordHash, user.PasswordSalt))
            return null;

        var (accessToken, refreshToken) = await IssueTokensAsync(
            user.Id, user.Email, user.Role, user.ChainId, user.LocationId, user.TherapistId);
        return (user.Id, user.Name, user.Role, user.IsEmulator, accessToken, refreshToken);
    }

    // Exchanges a still-valid, unrevoked refresh token for a new access/refresh pair, revoking the
    // old one in the same round (rotation) -- a token can only ever be redeemed once, so a stolen
    // copy replayed after the legitimate client already refreshed is rejected here (already revoked).
    public async Task<(int Id, string Name, string Email, UserRole Role, bool CanEmulate, string Token, string RefreshToken)?> RefreshAsync(string refreshToken)
    {
        var hash = TokenService.HashRefreshToken(refreshToken);
        var stored = await refreshTokens.GetAsync(hash);
        if (stored is null || stored.RevokedDate is not null || stored.ExpiresAt <= DateTime.UtcNow)
            return null;

        await refreshTokens.RevokeAsync(stored.Id);
        var (accessToken, newRefreshToken) = await IssueTokensAsync(
            stored.UserId, stored.Email, stored.Role, stored.ChainId, stored.LocationId, stored.TherapistId);
        return (stored.UserId, stored.Name, stored.Email, stored.Role, stored.IsEmulator, accessToken, newRefreshToken);
    }

    // Best-effort: an already-expired or unknown token has nothing to revoke, so this is silently a
    // no-op rather than an error -- logout must never fail because of borrowed-time token state.
    public async Task LogoutAsync(string refreshToken)
    {
        var hash = TokenService.HashRefreshToken(refreshToken);
        var stored = await refreshTokens.GetAsync(hash);
        if (stored is not null) await refreshTokens.RevokeAsync(stored.Id);
    }

    private async Task<(string AccessToken, string RefreshToken)> IssueTokensAsync(
        int userId, string email, UserRole role, int? chainId = null, int? locationId = null, int? therapistId = null)
    {
        var accessToken = tokens.CreateToken(userId, email, role, chainId, locationId, therapistId);
        var refreshToken = TokenService.GenerateRefreshToken();
        await refreshTokens.CreateAsync(userId, TokenService.HashRefreshToken(refreshToken), tokens.RefreshTokenExpiry);
        return (accessToken, refreshToken);
    }

    // Staff accounts (RootSuperAdmin/SuperAdmin/Admin/Manager/Receptionist/Therapist/Other) are
    // provisioned here -- never self-service, callers must already be behind an admin-only
    // authorization policy. AdminStaffEndpoints also lets this create a Customer role (a customer
    // created on someone's behalf, e.g. a walk-in with no account), separately from CreateCustomerAsync
    // below which backs the dedicated Customers management page.
    //
    // No admin-chosen password -- the admin creating the account never sees or sets a password at
    // all, only a random one is hashed into the row (unusable to anyone, never returned) and the new
    // user gets a "set your password" email using the same reset-token flow as forgot-password.
    public async Task<int> CreateStaffAsync(
        string name, string email, UserRole role, int? chainId, int? locationId, int? therapistId,
        bool isEmulator = false)
    {
        var (hash, salt) = PasswordHasher.Hash(GenerateRandomPassword());
        var id = await repo.CreateAsync(name, email, hash, salt, phone: null, role, chainId, locationId, therapistId, isEmulator);
        await SendSetPasswordEmailAsync(id, name, email, portalUrls.Value.AdminPortalUrl);
        return id;
    }

    // Customers management page's "Add Customer" -- unlike RegisterAsync (self-service, issues a
    // session), this is an admin creating an account on someone's behalf and returns just the new
    // id, no token: the admin stays logged in as themselves, not as the customer they just created.
    // Same no-admin-chosen-password treatment as CreateStaffAsync above, but the set-password link
    // points at the client portal instead.
    public async Task<int> CreateCustomerAsync(string name, string email, string? phone)
    {
        var (hash, salt) = PasswordHasher.Hash(GenerateRandomPassword());
        var id = await repo.CreateAsync(name, email, hash, salt, phone, UserRole.Customer);
        await SendSetPasswordEmailAsync(id, name, email, portalUrls.Value.ClientPortalUrl);
        return id;
    }

    // 24 random bytes, base64 -- never shown to the creating admin or returned from the endpoint,
    // exists only to give the row a valid (unusable-by-anyone) PasswordHash until the real owner
    // sets their own via the emailed reset link.
    private static string GenerateRandomPassword() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));

    private async Task SendSetPasswordEmailAsync(int userId, string name, string email, string portalBaseUrl)
    {
        var token = TokenService.GenerateRefreshToken();
        await resetTokens.CreateAsync(userId, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(SetPasswordExpiryHours));
        emailQueue.Enqueue(BuildPasswordEmail(
            name, email, portalBaseUrl, token,
            subject: "Set your password",
            intro: "An account has been created for you. Set your password to get started:",
            cta: "Set your password",
            expiryHours: SetPasswordExpiryHours));
    }

    // Always enqueues nothing and returns quietly when the email isn't registered -- a differing
    // response (or no-op vs error) would let a caller enumerate which emails have accounts.
    public async Task RequestPasswordResetAsync(string email)
    {
        var user = await repo.GetByEmailAsync(email);
        if (user is null) return;

        var token = TokenService.GenerateRefreshToken();
        await resetTokens.CreateAsync(user.Id, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(ForgotPasswordExpiryHours));
        var portalBaseUrl = user.Role == UserRole.Customer ? portalUrls.Value.ClientPortalUrl : portalUrls.Value.AdminPortalUrl;
        emailQueue.Enqueue(BuildPasswordEmail(
            user.Name, email, portalBaseUrl, token,
            subject: "Reset your password",
            intro: "We received a request to reset your password. Click below to choose a new one:",
            cta: "Reset your password",
            expiryHours: ForgotPasswordExpiryHours));
    }

    // Redeems a reset-password token (from either RequestPasswordResetAsync above or the
    // set-password email sent at account creation -- both draw from the same table/expiry-agnostic
    // check, so either link type lands here). Revokes every refresh token the user currently holds
    // once the password changes, so a stolen/stale session doesn't survive the owner taking their
    // account back.
    public async Task<bool> ResetPasswordAsync(string token, string newPassword)
    {
        var hash = TokenService.HashRefreshToken(token);
        var stored = await resetTokens.GetAsync(hash);
        if (stored is null || stored.ResetDate is not null || stored.ExpiresAt <= DateTime.UtcNow)
            return false;

        var (passwordHash, salt) = PasswordHasher.Hash(newPassword);
        await repo.UpdatePasswordAsync(stored.UserId, passwordHash, salt);
        await resetTokens.ConsumeAsync(stored.Id);
        await refreshTokens.RevokeAllForUserAsync(stored.UserId);
        return true;
    }

    private static EmailMessage BuildPasswordEmail(
        string name, string email, string portalBaseUrl, string token, string subject, string intro, string cta, int expiryHours)
    {
        var link = $"{portalBaseUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        var expiryText = expiryHours == 1 ? "1 hour" : expiryHours.ToString(CultureInfo.InvariantCulture) + " hours";
        var html = $"""
            <p>Hi {name},</p>
            <p>{intro}</p>
            <p><a href="{link}">{cta}</a></p>
            <p>This link expires in {expiryText}. If you didn't expect this email, you can ignore it.</p>
            """;
        return new EmailMessage(To: [new EmailAddress(email, name)], Subject: subject, HtmlBody: html);
    }

    // RootSuperAdmin/SuperAdmin/Admin with IsEmulator=1 may open a customer session on that
    // customer's behalf -- Manager/Receptionist/Therapist/Other can never hold IsEmulator=true at
    // all (see AdminStaffEndpoints' matching EmulatorEligibleRoles, which clamps it false for them
    // on every create/edit), so this check is partly redundant with that clamp, but kept as the
    // actual authorization gate here rather than trusting the clamp alone. The caller is already
    // behind the AdminAccess policy for the initiating endpoint, but that policy alone doesn't know
    // about IsEmulator, so both checks happen here against a fresh DB read -- never trust the flag
    // off the caller's JWT, since it can be revoked after the token was issued.
    private static readonly UserRole[] EmulatorEligibleRoles =
        [UserRole.RootSuperAdmin, UserRole.SuperAdmin, UserRole.Admin];

    public async Task<(int Id, string Name, string Email, string Token)?> EmulateCustomerAsync(int emulatorUserId, int customerUserId)
    {
        var emulator = await repo.GetByIdAsync(emulatorUserId);
        if (emulator is null || !emulator.IsEmulator || !EmulatorEligibleRoles.Contains(emulator.Role))
            return null;

        var customer = await repo.GetByIdAsync(customerUserId);
        if (customer is null || customer.Role != UserRole.Customer)
            return null;

        var token = tokens.CreateToken(customer.Id, customer.Email, UserRole.Customer, emulatedByUserId: emulator.Id);
        return (customer.Id, customer.Name, customer.Email, token);
    }
}
