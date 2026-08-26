using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record EmailChangeTokenRecord(int Id, int UserId, string NewEmail, DateTime ExpiresAt, DateTime? ConfirmedDate);

internal sealed class EmailChangeTokenRepository(SqlConnectionFactory factory, AuthDbService authDb)
{
    public async Task<int> CreateAsync(int userId, string newEmail, byte[] tokenHash, DateTime expiresAt)
    {
        using var db = factory.Create();
        return await authDb.sp_Auth_CreateEmailChangeTokenAsync(db, userId, newEmail, tokenHash, expiresAt);
    }

    public async Task<EmailChangeTokenRecord?> GetAsync(byte[] tokenHash)
    {
        using var db = factory.Create();
        return await authDb.sp_Auth_GetEmailChangeTokenAsync(db, tokenHash);
    }

    public async Task ConfirmAsync(int id, int userId, string newEmail)
    {
        using var db = factory.Create();
        await authDb.sp_Auth_ConfirmEmailChangeAsync(db, id, userId, newEmail);
    }
}
