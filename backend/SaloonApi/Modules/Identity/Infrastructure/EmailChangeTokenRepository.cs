using System.Data;
using Dapper;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record EmailChangeTokenRecord(int Id, int UserId, string NewEmail, DateTime ExpiresAt, DateTime? ConfirmedDate);

// Same opaque/hashed/single-use pattern as PasswordResetTokenRepository -- see EmailChangeTokens.
internal sealed class EmailChangeTokenRepository(SqlConnectionFactory factory)
{
    public async Task<int> CreateAsync(int userId, string newEmail, byte[] tokenHash, DateTime expiresAt)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_UserId", userId);
        p.Add("p_NewEmail", newEmail);
        p.Add("p_TokenHash", tokenHash);
        p.Add("p_ExpiresAt", expiresAt);
        p.Add("p_Id", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("public.sp_Auth_CreateEmailChangeToken", p);
        return p.Get<int>("p_Id");
    }

    public async Task<EmailChangeTokenRecord?> GetAsync(byte[] tokenHash)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<EmailChangeTokenRecord>("public.sp_Auth_GetEmailChangeToken", new { TokenHash = tokenHash });
    }

    public async Task ConfirmAsync(int id, int userId, string newEmail)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Auth_ConfirmEmailChange", new { Id = id, UserId = userId, NewEmail = newEmail });
    }
}
