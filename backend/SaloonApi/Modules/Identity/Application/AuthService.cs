using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthService(
    UserRepository repo, RefreshTokenRepository refreshTokens, PasswordResetTokenRepository resetTokens,
    EmailChangeTokenRepository emailChangeTokens, TokenService tokens, IBackgroundEmailQueue emailQueue,
    StripeCustomerService stripeCustomerService, IOptions<PortalUrlOptions> portalUrls, SseBroadcaster sse)
{
    // "Set your password" (new account, less urgent) gets a longer window than "forgot password"
    // (an active account-recovery request) -- both intentionally short compared to RefreshTokenExpiryDays.
    private const int SetPasswordExpiryHours = 72;
    private const int ForgotPasswordExpiryHours = 1;
    private const int EmailChangeExpiryHours = 24;

    public async Task<(int Id, string Token, string RefreshToken)> RegisterAsync(string name, string email, string password, string? phone)
    {
        var (hash, salt) = PasswordHasher.Hash(password);
        // Self-registration is always Customer role. Staff accounts are created via admin portal.
        var id = await repo.CreateAsync(name, email, hash, salt, phone);
        await stripeCustomerService.GetOrCreateCustomerAsync(id, name, email, phone);
        var (accessToken, refreshToken) = await IssueTokensAsync(id, email, UserRole.Customer);
        return (id, accessToken, refreshToken);
    }

    public async Task<(int Id, string Name, UserRole Role, bool CanEmulate, string Token, string RefreshToken, string? PhotoPath, bool IsEmailVerified)?> LoginAsync(string email, string password)
    {
        var user = await repo.GetByEmailAsync(email);
        if (user is null || !PasswordHasher.Verify(password, user.PasswordHash, user.PasswordSalt))
            return null;

        var (accessToken, refreshToken) = await IssueTokensAsync(
            user.Id, user.Email, user.Role, user.ChainId, user.LocationId, user.TherapistId);
        bool canEmulate = user.Role == UserRole.RootSuperAdmin || user.IsEmulator;
        return (user.Id, user.Name, user.Role, canEmulate, accessToken, refreshToken, user.PhotoPath, user.IsEmailVerified);
    }

    public async Task<(int Id, string Name, string Email, UserRole Role, bool CanEmulate, string Token, string RefreshToken, bool IsEmailVerified)?> RefreshAsync(string refreshToken)
    {
        var hash = TokenService.HashRefreshToken(refreshToken);
        var stored = await refreshTokens.GetAsync(hash);
        if (stored is null || stored.RevokedDate is not null || stored.ExpiresAt <= DateTime.UtcNow)
            return null;

        await refreshTokens.RevokeAsync(stored.Id);
        var (accessToken, newRefreshToken) = await IssueTokensAsync(
            stored.UserId, stored.Email, stored.Role, stored.ChainId, stored.LocationId, stored.TherapistId);
        bool canEmulate = stored.Role == UserRole.RootSuperAdmin || stored.IsEmulator;
        return (stored.UserId, stored.Name, stored.Email, stored.Role, canEmulate, accessToken, newRefreshToken, stored.IsEmailVerified);
    }

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

    public async Task<int> CreateStaffAsync(
        string name, string email, UserRole role, int? chainId, int? locationId, int? therapistId,
        bool isEmulator = false)
    {
        var (hash, salt) = PasswordHasher.Hash(GenerateRandomPassword());
        var id = await repo.CreateAsync(name, email, hash, salt, phone: null, role, chainId, locationId, therapistId, isEmulator);
        await stripeCustomerService.GetOrCreateCustomerAsync(id, name, email);
        await SendSetPasswordEmailAsync(id, name, email, portalUrls.Value.AdminPortalUrl);
        return id;
    }

    public async Task<int> CreateCustomerAsync(string name, string email, string? phone)
    {
        var (hash, salt) = PasswordHasher.Hash(GenerateRandomPassword());
        var id = await repo.CreateAsync(name, email, hash, salt, phone, UserRole.Customer);
        await stripeCustomerService.GetOrCreateCustomerAsync(id, name, email, phone);
        await SendSetPasswordEmailAsync(id, name, email, portalUrls.Value.ClientPortalUrl);
        return id;
    }

    private static string GenerateRandomPassword() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));

    private async Task SendSetPasswordEmailAsync(int userId, string name, string email, string portalBaseUrl)
    {
        var token = TokenService.GenerateRefreshToken();
        await resetTokens.CreateAsync(userId, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(SetPasswordExpiryHours));
        emailQueue.Enqueue(BuildPasswordEmail(
            name, email, portalBaseUrl, token,
            subject: "Set your password",
            intro: "An account has been created for you.",
            actionLabel: "Set Your Password"));
    }

    public async Task RequestPasswordResetAsync(string email)
    {
        var user = await repo.GetByEmailAsync(email);
        if (user is null) return;

        var token = TokenService.GenerateRefreshToken();
        await resetTokens.CreateAsync(user.Id, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(ForgotPasswordExpiryHours));

        var portalUrl = user.Role == UserRole.Customer ? portalUrls.Value.ClientPortalUrl : portalUrls.Value.AdminPortalUrl;
        emailQueue.Enqueue(BuildPasswordEmail(
            user.Name, user.Email, portalUrl, token,
            subject: "Reset your password",
            intro: "We received a request to reset your password.",
            actionLabel: "Reset Password"));
    }

    public async Task<bool> ResetPasswordAsync(string rawToken, string newPassword)
    {
        var hash = TokenService.HashRefreshToken(rawToken);
        var stored = await resetTokens.GetAsync(hash);
        if (stored is null || stored.ResetDate is not null || stored.ExpiresAt <= DateTime.UtcNow)
            return false;

        var (passwordHash, passwordSalt) = PasswordHasher.Hash(newPassword);
        await repo.UpdatePasswordAsync(stored.UserId, passwordHash, passwordSalt);
        await resetTokens.ConsumeAsync(stored.Id);
        return true;
    }

    // Stages the change and mails a confirmation link to the NEW address -- Users.Email is only
    // updated once that link is clicked (ConfirmEmailChangeAsync below), so a typo'd or someone-else's
    // address can never silently take over the account.
    public async Task RequestEmailChangeAsync(int userId, UserRole role, string name, string newEmail)
    {
        var token = TokenService.GenerateRefreshToken();
        await emailChangeTokens.CreateAsync(userId, newEmail, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(EmailChangeExpiryHours));

        var portalUrl = role == UserRole.Customer ? portalUrls.Value.ClientPortalUrl : portalUrls.Value.AdminPortalUrl;
        emailQueue.Enqueue(BuildEmailChangeEmail(name, newEmail, portalUrl, token));
    }

    public async Task<bool> ConfirmEmailChangeAsync(string rawToken)
    {
        var hash = TokenService.HashRefreshToken(rawToken);
        var stored = await emailChangeTokens.GetAsync(hash);
        if (stored is null || stored.ConfirmedDate is not null || stored.ExpiresAt <= DateTime.UtcNow)
            return false;

        await emailChangeTokens.ConfirmAsync(stored.Id, stored.UserId, stored.NewEmail);
        // Lets a ProfilePage left open in another tab/device flip its Unverified badge live,
        // without polling -- same "signal only, no payload" shape as the booking slot-changed stream.
        sse.Publish(SseBroadcaster.UserGroup(stored.UserId), "email-verified");
        return true;
    }

    public async Task<(int Id, string Name, string Email, string Token)?> EmulateCustomerAsync(int actingStaffId, int targetCustomerId)
    {
        var staff = await repo.GetByIdAsync(actingStaffId);
        if (staff is null || !staff.IsEmulator && staff.Role != UserRole.RootSuperAdmin)
            return null;

        var customer = await repo.GetByIdAsync(targetCustomerId);
        if (customer is null || customer.Role != UserRole.Customer)
            return null;

        var token = tokens.CreateToken(customer.Id, customer.Email, UserRole.Customer, emulatedByUserId: actingStaffId);
        return (customer.Id, customer.Name, customer.Email, token);
    }

    private static EmailMessage BuildPasswordEmail(
        string name, string email, string portalBaseUrl, string token,
        string subject, string intro, string actionLabel)
    {
        var resetLink = $"{portalBaseUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        var html = $"""
            <p>Hi {name},</p>
            <p>{intro}</p>
            <p><a href="{resetLink}">{actionLabel}</a></p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            """;

        return new EmailMessage(
            To: [new EmailAddress(email, name)],
            Subject: subject,
            HtmlBody: html);
    }

    // Also used to (re-)verify a caller's own current, still-unverified address -- see
    // /api/profile/email/verify-request -- so the copy stays neutral rather than implying a change.
    private static EmailMessage BuildEmailChangeEmail(string name, string newEmail, string portalBaseUrl, string token)
    {
        var confirmLink = $"{portalBaseUrl}/verify-email?token={Uri.EscapeDataString(token)}";
        var html = $"""
            <p>Hi {name},</p>
            <p>Confirm this address for your Saloon Chains account.</p>
            <p><a href="{confirmLink}">Confirm Email Address</a></p>
            <p>If you didn't request this, you can safely ignore this email -- your account email won't change.</p>
            """;

        return new EmailMessage(
            To: [new EmailAddress(newEmail, name)],
            Subject: "Confirm your new email address",
            HtmlBody: html);
    }
}
