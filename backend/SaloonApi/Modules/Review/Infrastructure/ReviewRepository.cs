using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Review.Infrastructure;

internal sealed class ReviewRepository(SqlConnectionFactory factory, ReviewDbService reviewDb)
{
    public async Task<int> CreateAsync(int bookingId, int customerId, byte rating, string? comment)
    {
        using var db = factory.Create();
        return await reviewDb.sp_Review_CreateAsync(db, bookingId, rating, comment, customerId);
    }
}
