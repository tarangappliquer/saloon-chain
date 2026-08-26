using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record PasswordResetTokenRecord(int Id, int UserId, DateTime ExpiresAt, DateTime? ResetDate, string Name, string Email);

internal sealed class PasswordResetTokenRepository(SqlConnectionFactory factory, AuthDbService authDb)
{
    public async Task<int> CreateAsync(int userId, byte[] tokenHash, DateTime expiresAt)
    {
        using var db = factory.Create();
        return await authDb.sp_Auth_CreatePasswordResetTokenAsync(db, userId, tokenHash, expiresAt);
    }

    public async Task<PasswordResetTokenRecord?> GetAsync(byte[] tokenHash)
    {
        using var db = factory.Create();
        return await authDb.sp_Auth_GetPasswordResetTokenAsync(db, tokenHash);
    }

    public async Task ConsumeAsync(int id)
    {
        using var db = factory.Create();
        await authDb.sp_Auth_ConsumePasswordResetTokenAsync(db, id);
    }
}
