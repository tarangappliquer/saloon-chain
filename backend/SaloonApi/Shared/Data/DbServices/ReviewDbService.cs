using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class ReviewDbService
{
    // sp_Review_Create has no CreatedBy param at all -- it validates ownership via CustomerId
    // (WHERE b.CustomerId = p_CustomerId, see the function body) and has no audit column on
    // Reviews. The 4th argument here was already the caller's customerId, just bound to a SQL
    // parameter name ("CreatedBy") that doesn't exist on this function -- renamed for clarity and
    // switched to a named-argument call matching the function's actual (BookingId, CustomerId,
    // Rating, Comment) order.
    public Task<int> sp_Review_CreateAsync(IDbConnection db, int bookingId, int rating, string? comment, int customerId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("Rating", rating, DbType.Int32);
        args.Add("Comment", comment, DbType.String);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Review_Create(p_BookingId => @BookingId, p_CustomerId => @CustomerId, p_Rating => @Rating, p_Comment => @Comment)",
            args, commandType: CommandType.Text);
    }
}
