using SaloonApi.Modules.Payment.Application;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Payment.Infrastructure;

internal sealed class PaymentRepository(SqlConnectionFactory factory, PaymentDbService paymentDb)
{
    public async Task<int> CreateAsync(
        int bookingId, decimal amount, string currency, string provider, string paymentMethod, string status,
        string? transactionId = null, string? clientSecret = null, int? createdBy = null, decimal tipAmount = 0)
    {
        using var conn = factory.Create();
        return await paymentDb.sp_Payment_CreateAsync(
            conn, bookingId, amount, currency, provider, paymentMethod, status, transactionId, clientSecret, createdBy, tipAmount);
    }

    public async Task UpdateStatusAsync(
        int paymentId, string status, string? transactionId = null, string? failureReason = null, int? updatedBy = null,
        decimal? amountTendered = null)
    {
        using var conn = factory.Create();
        await paymentDb.sp_Payment_UpdateStatusAsync(conn, paymentId, status, transactionId, failureReason, updatedBy, amountTendered);
    }

    public async Task<IReadOnlyList<PaymentDto>> GetByBookingIdAsync(int bookingId)
    {
        using var conn = factory.Create();
        return (await paymentDb.sp_Payment_GetByBookingIdAsync(conn, bookingId)).ToList();
    }

    public async Task<PaymentDto?> GetByIdAsync(int paymentId)
    {
        using var conn = factory.Create();
        return await paymentDb.sp_Payment_GetByIdAsync(conn, paymentId);
    }
}
