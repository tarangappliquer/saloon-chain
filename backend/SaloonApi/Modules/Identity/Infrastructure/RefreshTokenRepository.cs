using System.Data;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record RefreshTokenRecord(
    int Id, int UserId, DateTime ExpiresAt, DateTime? RevokedDate,
    string Name, string Email, UserRole Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator,
    bool IsEmailVerified);

internal sealed class RefreshTokenRepository(SqlConnectionFactory factory)
{
    public async Task<int> CreateAsync(int userId, byte[] tokenHash, DateTime expiresAt)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@UserId", userId);
        p.Add("@TokenHash", tokenHash);
        p.Add("@ExpiresAt", expiresAt);
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("public.sp_Auth_CreateRefreshToken", p);
        return p.Get<int>("@Id");
    }

    public async Task<RefreshTokenRecord?> GetAsync(byte[] tokenHash)
    {
        using var db = factory.Create();
        var row = await db.QuerySingleSpAsync<RefreshTokenRow>("public.sp_Auth_GetRefreshToken", new { TokenHash = tokenHash });
        return row is null ? null : new RefreshTokenRecord(
            row.Id, row.UserId, row.ExpiresAt, row.RevokedDate,
            row.Name, row.Email, Enum.Parse<UserRole>(row.Role), row.ChainId, row.LocationId, row.TherapistId, row.IsEmulator,
            row.IsEmailVerified);
    }

    public async Task RevokeAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Auth_RevokeRefreshToken", new { Id = id });
    }

    // Called after a successful password reset -- a stolen/stale session shouldn't survive the
    // owner taking their account back.
    public async Task RevokeAllForUserAsync(int userId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Auth_RevokeAllRefreshTokens", new { UserId = userId });
    }

    // Dapper needs Role as a plain string to map from the sproc's VARCHAR column -- RefreshTokenRecord
    // exposes it as the enum, converted just above (same pattern as UserRepository.UserRow).
    private sealed record RefreshTokenRow(
        int Id, int UserId, DateTime ExpiresAt, DateTime? RevokedDate,
        string Name, string Email, string Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator,
        bool IsEmailVerified);
}
