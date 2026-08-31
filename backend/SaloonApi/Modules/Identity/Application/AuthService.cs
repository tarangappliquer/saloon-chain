using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Email.TemplateModels;
using SaloonApi.Shared.Realtime;

namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthService(
    UserRepository repo, RefreshTokenRepository refreshTokens, PasswordResetTokenRepository resetTokens,
    EmailChangeTokenRepository emailChangeTokens, TokenService tokens, IBackgroundEmailQueue emailQueue,
    IEmailBodyBuilder bodyBuilder, StripeCustomerService stripeCustomerService, IOptionsMonitor<PortalUrlOptions> portalUrls,
    SseBroadcaster sse, IOptionsMonitor<AuthOptions> authOptions)
{
    public async Task<(int Id, string Token, string RefreshToken)> RegisterAsync(string name, string email, string password, string? phone)
    {
        var (hash, salt) = PasswordHasher.Hash(password);
        // Self-registration is always Customer role. Staff accounts are created via admin portal.
        bool isEmailVerified = !authOptions.CurrentValue.RequireEmailVerification;
        var id = await repo.CreateAsync(name, email, hash, salt, phone, isEmailVerified: isEmailVerified);
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
        bool isEmailVerified = !authOptions.CurrentValue.RequireEmailVerification || user.IsEmailVerified;
        return (user.Id, user.Name, user.Role, canEmulate, accessToken, refreshToken, user.PhotoPath, isEmailVerified);
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
        bool isEmailVerified = !authOptions.CurrentValue.RequireEmailVerification || stored.IsEmailVerified;
        return (stored.UserId, stored.Name, stored.Email, stored.Role, canEmulate, accessToken, newRefreshToken, isEmailVerified);
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
        bool isEmulator = false, DateOnly? joiningDate = null)
    {
        var (hash, salt) = PasswordHasher.Hash(GenerateRandomPassword());
        var id = await repo.CreateAsync(
            name, email, hash, salt, phone: null, role, chainId, locationId, therapistId, isEmulator,
            joiningDate ?? DateOnly.FromDateTime(DateTime.UtcNow));
        await stripeCustomerService.GetOrCreateCustomerAsync(id, name, email);
        await SendSetPasswordEmailAsync(id, name, email, portalUrls.CurrentValue.AdminPortalUrl);
        return id;
    }

    public async Task<int> CreateCustomerAsync(string name, string? email, string? phone, bool isWalkIn = false)
    {
        var finalEmail = string.IsNullOrWhiteSpace(email)
            ? $"walkin-{RandomNumberGenerator.GetInt32(100000, 999999)}-{DateTime.UtcNow.Ticks}@saloon.local"
            : email;

        var (hash, salt) = PasswordHasher.Hash(GenerateRandomPassword());
        var id = await repo.CreateAsync(name, finalEmail, hash, salt, phone, UserRole.Customer, isWalkIn: isWalkIn);
        if (!isWalkIn)
        {
            await stripeCustomerService.GetOrCreateCustomerAsync(id, name, finalEmail, phone);
            await SendSetPasswordEmailAsync(id, name, finalEmail, portalUrls.CurrentValue.ClientPortalUrl);
        }
        return id;
    }

    private static string GenerateRandomPassword() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));

    private async Task SendSetPasswordEmailAsync(int userId, string name, string email, string portalBaseUrl)
    {
        var token = TokenService.GenerateRefreshToken();
        await resetTokens.CreateAsync(userId, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(authOptions.CurrentValue.SetPasswordExpiryHours));
        var resetLink = $"{portalBaseUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        var model = new SetPasswordEmailModel
        {
            RecipientName = name,
            IntroText = "An account has been created for you.",
            ResetLink = resetLink,
            ActionLabel = "Set Your Password"
        };
        var html = await bodyBuilder.BuildSetPasswordAsync(model).ConfigureAwait(false);
        var emailMsg = new EmailMessage(
            To: [new EmailAddress(email, name)], 
            Subject: "Set your password", 
            HtmlBody: html);

        await emailQueue.EnqueueAsync(emailMsg).ConfigureAwait(false);
    }

    public async Task RequestPasswordResetAsync(string email)
    {
        var user = await repo.GetByEmailAsync(email);
        if (user is null) return;

        var token = TokenService.GenerateRefreshToken();
        await resetTokens.CreateAsync(user.Id, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(authOptions.CurrentValue.ForgotPasswordExpiryHours));

        var portalUrl = user.Role == UserRole.Customer ? portalUrls.CurrentValue.ClientPortalUrl : portalUrls.CurrentValue.AdminPortalUrl;
        var resetLink = $"{portalUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        var model = new SetPasswordEmailModel
        {
            RecipientName = user.Name,
            IntroText = "We received a request to reset your password.",
            ResetLink = resetLink,
            ActionLabel = "Reset Password"
        };
        var html = await bodyBuilder.BuildSetPasswordAsync(model).ConfigureAwait(false);
        var emailMsg = new EmailMessage(
            To: [new EmailAddress(user.Email, user.Name)], 
            Subject: "Reset your password", 
            HtmlBody: html);
        await emailQueue.EnqueueAsync(emailMsg).ConfigureAwait(false);
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
        await refreshTokens.RevokeAllForUserAsync(stored.UserId);
        sse.Publish(SseBroadcaster.UserGroup(stored.UserId), "user-logged-out");
        return true;
    }

    // Stages the change and mails a confirmation link to the NEW address -- Users.Email is only
    // updated once that link is clicked (ConfirmEmailChangeAsync below), so a typo'd or someone-else's
    // address can never silently take over the account.
    public async Task RequestEmailChangeAsync(int userId, UserRole role, string name, string newEmail)
    {
        var token = TokenService.GenerateRefreshToken();
        await emailChangeTokens.CreateAsync(userId, newEmail, TokenService.HashRefreshToken(token), DateTime.UtcNow.AddHours(authOptions.CurrentValue.EmailChangeExpiryHours));

        var portalUrl = role == UserRole.Customer ? portalUrls.CurrentValue.ClientPortalUrl : portalUrls.CurrentValue.AdminPortalUrl;
        var confirmLink = $"{portalUrl}/verify-email?token={Uri.EscapeDataString(token)}";
        var model = new EmailChangeVerificationModel
        {
            RecipientName = name,
            ConfirmLink = confirmLink
        };
        var html = await bodyBuilder.BuildEmailChangeVerificationAsync(model).ConfigureAwait(false);
        var emailMsg = new EmailMessage(
            To: [new EmailAddress(newEmail, name)], 
            Subject: "Confirm your new email address", 
            HtmlBody: html);
        await emailQueue.EnqueueAsync(emailMsg).ConfigureAwait(false);
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
}
