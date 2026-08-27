using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Profile.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class ProfileDbService
{
    public Task<ProfileRow?> sp_Profile_GetCustomerAsync(IDbConnection db, int userId)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<ProfileRow>("SELECT * FROM public.sp_Profile_GetCustomer(@UserId)", args, commandType: CommandType.Text);
    }

    public Task<ProfileRow?> sp_Profile_GetStaffAsync(IDbConnection db, int userId)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<ProfileRow>("SELECT * FROM public.sp_Profile_GetStaff(@UserId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Profile_UpdateSelfAsync(IDbConnection db, int userId, string name, string? phone)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("Phone", phone, DbType.String);
        await db.ExecuteAsync("SELECT public.sp_Profile_UpdateSelf(@UserId, @Name, @Phone)", args, commandType: CommandType.Text);
    }

    public async Task sp_Profile_SetCustomerPhotoAsync(IDbConnection db, int userId, string photoPath)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("PhotoPath", photoPath, DbType.String);
        await db.ExecuteAsync("SELECT public.sp_Profile_SetCustomerPhoto(@UserId, @PhotoPath)", args, commandType: CommandType.Text);
    }

    public async Task sp_Profile_SetStaffPhotoAsync(IDbConnection db, int userId, string photoPath)
    {
        var args = new DynamicParameters();
        args.Add("UserId", userId, DbType.Int32);
        args.Add("PhotoPath", photoPath, DbType.String);
        await db.ExecuteAsync("SELECT public.sp_Profile_SetStaffPhoto(@UserId, @PhotoPath)", args, commandType: CommandType.Text);
    }
}
