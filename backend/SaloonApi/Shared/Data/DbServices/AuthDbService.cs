using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Identity.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class AuthDbService
{
    public Task<int> sp_Auth_CreateUserAsync(
        IDbConnection db, string name, string email, byte[] passwordHash, byte[] passwordSalt, string? phone,
        string role, int? chainId, int? locationId, int? therapistId, bool isEmulator, DateOnly? joiningDate,
        bool isWalkIn, int? createdBy, bool isEmailVerified)
    {
        var args = new DynamicParameters();
        args.Add("Name", name, DbType.String);
        args.Add("Email", email, DbType.String);
        args.Add("PasswordHash", passwordHash, DbType.Binary);
        args.Add("PasswordSalt", passwordSalt, DbType.Binary);
        args.Add("Phone", phone, DbType.String);
        args.Add("Role", role, DbType.String);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("TherapistId", therapistId, DbType.Int32);
        args.Add("IsEmulator", isEmulator, DbType.Boolean);
        args.Add("JoiningDate", joiningDate, DbType.Date);
        args.Add("IsWalkIn", isWalkIn, DbType.Boolean);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        args.Add("IsEmailVerified", isEmailVerified, DbType.Boolean);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Auth_CreateUser(@Name, @Email, @PasswordHash, @PasswordSalt, @Phone, @Role, @ChainId, @LocationId, @TherapistId, @IsEmulator, @JoiningDate, @IsWalkIn, @CreatedBy, @IsEmailVerified)",
            args, commandType: CommandType.Text);
    }

    public Task<UserRow?> sp_Auth_GetUserByEmailAsync(IDbConnection db, string email)
    {
        var args = new DynamicParameters();
        args.Add("Email", email, DbType.String);
        return db.QuerySingleOrDefaultAsync<UserRow>("SELECT * FROM public.sp_Auth_GetUserByEmail(@Email)", args, commandType: CommandType.Text);
    }

    public Task<UserRow?> sp_Auth_GetUserByIdAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<UserRow>("SELECT * FROM public.sp_Auth_GetUserById(@Id)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Auth_CreateRefreshTokenAsync(IDbConnection db, int userId, byte[] tokenHash, DateTime expiresAt)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("TokenHash", tokenHash, DbType.Binary);
        args.Add("ExpiresAt", expiresAt, DbType.DateTime);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Auth_CreateRefreshToken(@UserId, @TokenHash, @ExpiresAt)", args, commandType: CommandType.Text);
    }

    public Task<RefreshTokenRow?> sp_Auth_GetRefreshTokenAsync(IDbConnection db, byte[] tokenHash)
    {
        var args = new DynamicParameters();
        args.Add("TokenHash", tokenHash, DbType.Binary);
        return db.QuerySingleOrDefaultAsync<RefreshTokenRow>("SELECT * FROM public.sp_Auth_GetRefreshToken(@TokenHash)", args, commandType: CommandType.Text);
    }

    public async Task sp_Auth_RevokeRefreshTokenAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Auth_RevokeRefreshToken(@Id)", args, commandType: CommandType.Text);
    }

    public async Task sp_Auth_RevokeAllRefreshTokensAsync(IDbConnection db, int userId)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Auth_RevokeAllRefreshTokens(@UserId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Auth_CreatePasswordResetTokenAsync(IDbConnection db, int userId, byte[] tokenHash, DateTime expiresAt)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("TokenHash", tokenHash, DbType.Binary);
        args.Add("ExpiresAt", expiresAt, DbType.DateTime);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Auth_CreatePasswordResetToken(@UserId, @TokenHash, @ExpiresAt)", args, commandType: CommandType.Text);
    }

    public Task<PasswordResetTokenRecord?> sp_Auth_GetPasswordResetTokenAsync(IDbConnection db, byte[] tokenHash)
    {
        var args = new DynamicParameters();
        args.Add("TokenHash", tokenHash, DbType.Binary);
        return db.QuerySingleOrDefaultAsync<PasswordResetTokenRecord>("SELECT * FROM public.sp_Auth_GetPasswordResetToken(@TokenHash)", args, commandType: CommandType.Text);
    }

    public async Task sp_Auth_ConsumePasswordResetTokenAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Auth_ConsumePasswordResetToken(@Id)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Auth_CreateEmailChangeTokenAsync(IDbConnection db, int userId, string newEmail, byte[] tokenHash, DateTime expiresAt)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("NewEmail", newEmail, DbType.String);
        args.Add("TokenHash", tokenHash, DbType.Binary);
        args.Add("ExpiresAt", expiresAt, DbType.DateTime);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Auth_CreateEmailChangeToken(@UserId, @NewEmail, @TokenHash, @ExpiresAt)", args, commandType: CommandType.Text);
    }

    public Task<EmailChangeTokenRecord?> sp_Auth_GetEmailChangeTokenAsync(IDbConnection db, byte[] tokenHash)
    {
        var args = new DynamicParameters();
        args.Add("TokenHash", tokenHash, DbType.Binary);
        return db.QuerySingleOrDefaultAsync<EmailChangeTokenRecord>("SELECT * FROM public.sp_Auth_GetEmailChangeToken(@TokenHash)", args, commandType: CommandType.Text);
    }

    public async Task sp_Auth_ConfirmEmailChangeAsync(IDbConnection db, int id, int userId, string newEmail)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UserId", userId, DbType.Int32);
        args.Add("NewEmail", newEmail, DbType.String);
        await db.ExecuteAsync("CALL public.sp_Auth_ConfirmEmailChange(@Id, @UserId, @NewEmail)", args, commandType: CommandType.Text);
    }

    public async Task sp_Auth_UpdatePasswordAsync(IDbConnection db, int userId, byte[] passwordHash, byte[] passwordSalt)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("PasswordHash", passwordHash, DbType.Binary);
        args.Add("PasswordSalt", passwordSalt, DbType.Binary);
        await db.ExecuteAsync("CALL public.sp_Auth_UpdatePassword(@UserId, @PasswordHash, @PasswordSalt)", args, commandType: CommandType.Text);
    }

    public async Task sp_User_UpdateStripeCustomerIdAsync(IDbConnection db, int userId, string stripeCustomerId)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("StripeCustomerId", stripeCustomerId, DbType.String);
        await db.ExecuteAsync("CALL public.sp_User_UpdateStripeCustomerId(@UserId, @StripeCustomerId)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_User_HasCustomerBookingInChainAsync(IDbConnection db, int customerId, int chainId)
    {
        var args = new DynamicParameters();
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_User_HasCustomerBookingInChain(@CustomerId, @ChainId)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_User_IsLocationInChainAsync(IDbConnection db, int locationId, int chainId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_User_IsLocationInChain(@LocationId, @ChainId)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_User_ExistsWithRoleAsync(IDbConnection db, string role)
    {
        var args = new DynamicParameters();
        args.Add("Role", role, DbType.String);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_User_ExistsWithRole(@Role)", args, commandType: CommandType.Text);
    }
}
