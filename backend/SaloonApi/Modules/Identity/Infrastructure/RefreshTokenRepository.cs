using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record RefreshTokenRecord(
    int Id, int UserId, DateTime ExpiresAt, DateTime? RevokedDate,
    string Name, string Email, UserRole Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator,
    bool IsEmailVerified);

internal sealed record RefreshTokenRow(
    int Id, int UserId, DateTime ExpiresAt, DateTime? RevokedDate,
    string Name, string Email, string Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator,
    bool IsEmailVerified);

internal sealed class RefreshTokenRepository(SqlConnectionFactory factory, AuthDbService authDb)
{
    public async Task<int> CreateAsync(int userId, byte[] tokenHash, DateTime expiresAt)
    {
        using var db = factory.Create();
        return await authDb.sp_Auth_CreateRefreshTokenAsync(db, userId, tokenHash, expiresAt);
    }

    public async Task<RefreshTokenRecord?> GetAsync(byte[] tokenHash)
    {
        using var db = factory.Create();
        var row = await authDb.sp_Auth_GetRefreshTokenAsync(db, tokenHash);
        return row is null ? null : new RefreshTokenRecord(
            row.Id, row.UserId, row.ExpiresAt, row.RevokedDate,
            row.Name, row.Email, Enum.Parse<UserRole>(row.Role), row.ChainId, row.LocationId, row.TherapistId, row.IsEmulator,
            row.IsEmailVerified);
    }

    public async Task RevokeAsync(int id)
    {
        using var db = factory.Create();
        await authDb.sp_Auth_RevokeRefreshTokenAsync(db, id);
    }

    public async Task RevokeAllForUserAsync(int userId)
    {
        using var db = factory.Create();
        await authDb.sp_Auth_RevokeAllRefreshTokensAsync(db, userId);
    }
}
