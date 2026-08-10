using System.Data;
using Dapper;
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
        var p = new DynamicParameters();
        p.Add("@BookingId", bookingId);
        p.Add("@Amount", amount);
        p.Add("@Currency", currency);
        p.Add("@Provider", provider);
        p.Add("@PaymentMethod", paymentMethod);
        p.Add("@Status", status);
        p.Add("@TransactionId", transactionId);
        p.Add("@ClientSecret", clientSecret);
        p.Add("@CreatedBy", createdBy);
        p.Add("@TipAmount", tipAmount);

        return await conn.ExecuteScalarAsync<int>("dbo.sp_Payment_Create", p, commandType: CommandType.StoredProcedure);
    }

    public async Task UpdateStatusAsync(
        int paymentId, string status, string? transactionId = null, string? failureReason = null, int? updatedBy = null,
        decimal? amountTendered = null)
    {
        using var conn = factory.Create();
        var p = new DynamicParameters();
        p.Add("@PaymentId", paymentId);
        p.Add("@Status", status);
        p.Add("@TransactionId", transactionId);
        p.Add("@FailureReason", failureReason);
        p.Add("@UpdatedBy", updatedBy);
        p.Add("@AmountTendered", amountTendered);

        await conn.ExecuteAsync("dbo.sp_Payment_UpdateStatus", p, commandType: CommandType.StoredProcedure);
    }

    public async Task<IReadOnlyList<PaymentDto>> GetByBookingIdAsync(int bookingId)
    {
        using var conn = factory.Create();
        var p = new DynamicParameters();
        p.Add("@BookingId", bookingId);

        var list = await conn.QueryAsync<PaymentDto>("dbo.sp_Payment_GetByBookingId", p, commandType: CommandType.StoredProcedure);
        return list.ToList();
    }

    public async Task<PaymentDto?> GetByIdAsync(int paymentId)
    {
        using var conn = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Id", paymentId);

        return await conn.QuerySingleOrDefaultAsync<PaymentDto>("dbo.sp_Payment_GetById", p, commandType: CommandType.StoredProcedure);
    }
}
