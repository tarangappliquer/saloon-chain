using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Review.Infrastructure;

internal sealed class ReviewRepository(SqlConnectionFactory factory)
{
    // Eligibility (Confirmed + every treatment's EndTime passed) and the one-review-per-booking
    // rule are both enforced in sp_Review_Create, not here -- see that proc's comment.
    public async Task<int> CreateAsync(int bookingId, int customerId, byte rating, string? comment)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int>("dbo.sp_Review_Create", new
        {
            BookingId = bookingId,
            CustomerId = customerId,
            Rating = rating,
            Comment = comment
        });
    }
}
