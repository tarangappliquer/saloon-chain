using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class ReviewDbService
{
    public Task<int> sp_Review_CreateAsync(IDbConnection db, int bookingId, int rating, string? comment, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("Rating", rating, DbType.Int32);
        args.Add("Comment", comment, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Review_Create(@BookingId, @Rating, @Comment, @CreatedBy)", args, commandType: CommandType.Text);
    }
}
