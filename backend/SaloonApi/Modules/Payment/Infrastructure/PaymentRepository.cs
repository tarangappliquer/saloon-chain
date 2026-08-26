using SaloonApi.Modules.Payment.Application;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Payment.Infrastructure;

internal sealed class PaymentRepository(SqlConnectionFactory factory)
{
    public async Task<int> CreateAsync(
        int bookingId, decimal amount, string currency, string provider, string paymentMethod, string status,
        string? transactionId = null, string? clientSecret = null, int? createdBy = null, decimal tipAmount = 0)
    {
        using var conn = factory.Create();
        return await conn.QuerySingleSpAsync<int>("public.sp_Payment_Create", new
        {
            BookingId = bookingId,
            Amount = amount,
            Currency = currency,
            Provider = provider,
            PaymentMethod = paymentMethod,
            Status = status,
            TransactionId = transactionId,
            ClientSecret = clientSecret,
            CreatedBy = createdBy,
            TipAmount = tipAmount
        });
    }

    public async Task UpdateStatusAsync(
        int paymentId, string status, string? transactionId = null, string? failureReason = null, int? updatedBy = null,
        decimal? amountTendered = null)
    {
        using var conn = factory.Create();
        await conn.ExecuteSpAsync("public.sp_Payment_UpdateStatus", new
        {
            PaymentId = paymentId,
            Status = status,
            TransactionId = transactionId,
            FailureReason = failureReason,
            UpdatedBy = updatedBy,
            AmountTendered = amountTendered
        });
    }

    public async Task<IReadOnlyList<PaymentDto>> GetByBookingIdAsync(int bookingId)
    {
        using var conn = factory.Create();
        return (await conn.QuerySpAsync<PaymentDto>("public.sp_Payment_GetByBookingId", new { BookingId = bookingId })).ToList();
    }

    public async Task<PaymentDto?> GetByIdAsync(int paymentId)
    {
        using var conn = factory.Create();
        return await conn.QuerySingleSpAsync<PaymentDto>("public.sp_Payment_GetById", new { Id = paymentId });
    }
}
