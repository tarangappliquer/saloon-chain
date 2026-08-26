using System.Data;
using Dapper;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record PasswordResetTokenRecord(int Id, int UserId, DateTime ExpiresAt, DateTime? ResetDate, string Name, string Email);

// Same opaque/hashed/single-use pattern as RefreshTokenRepository -- see PasswordResetTokens.
internal sealed class PasswordResetTokenRepository(SqlConnectionFactory factory)
{
    public async Task<int> CreateAsync(int userId, byte[] tokenHash, DateTime expiresAt)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_UserId", userId);
        p.Add("p_TokenHash", tokenHash);
        p.Add("p_ExpiresAt", expiresAt);
        p.Add("p_Id", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("public.sp_Auth_CreatePasswordResetToken", p);
        return p.Get<int>("p_Id");
    }

    public async Task<PasswordResetTokenRecord?> GetAsync(byte[] tokenHash)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<PasswordResetTokenRecord>("public.sp_Auth_GetPasswordResetToken", new { TokenHash = tokenHash });
    }

    public async Task ConsumeAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Auth_ConsumePasswordResetToken", new { Id = id });
    }
}
