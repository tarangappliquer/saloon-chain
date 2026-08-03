using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;

namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthService(UserRepository repo, RefreshTokenRepository refreshTokens, TokenService tokens)
{
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

    // Staff accounts (SuperAdmin/Admin/Manager/Therapist) are provisioned here, never self-service --
    // callers must already be behind an admin-only authorization policy.
    public async Task<int> CreateStaffAsync(
        string name, string email, string password, UserRole role, int? chainId, int? locationId, int? therapistId)
    {
        var (hash, salt) = PasswordHasher.Hash(password);
        return await repo.CreateAsync(name, email, hash, salt, phone: null, role, chainId, locationId, therapistId);
    }

    // Only SuperAdmin/Admin/Manager rows with IsEmulator=1 may open a customer session on that
    // customer's behalf (docs/initial-project-spec.md). The caller is already behind the
    // AdminAccess policy (Therapist/Customer can't reach this endpoint at all), but that policy
    // alone doesn't know about IsEmulator, so both checks happen here against a fresh DB read --
    // never trust the flag off the caller's JWT, since it can be revoked after the token was issued.
    private static readonly UserRole[] EmulatorEligibleRoles = [UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager];

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
