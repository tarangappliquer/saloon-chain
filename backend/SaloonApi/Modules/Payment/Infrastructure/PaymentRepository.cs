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
        p.Add("p_BookingId", bookingId);
        p.Add("p_Amount", amount);
        p.Add("p_Currency", currency);
        p.Add("p_Provider", provider);
        p.Add("p_PaymentMethod", paymentMethod);
        p.Add("p_Status", status);
        p.Add("p_TransactionId", transactionId);
        p.Add("p_ClientSecret", clientSecret);
        p.Add("p_CreatedBy", createdBy);
        p.Add("p_TipAmount", tipAmount);

        return await conn.ExecuteScalarAsync<int>("public.sp_Payment_Create", p, commandType: CommandType.StoredProcedure);
    }

    public async Task UpdateStatusAsync(
        int paymentId, string status, string? transactionId = null, string? failureReason = null, int? updatedBy = null,
        decimal? amountTendered = null)
    {
        using var conn = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_PaymentId", paymentId);
        p.Add("p_Status", status);
        p.Add("p_TransactionId", transactionId);
        p.Add("p_FailureReason", failureReason);
        p.Add("p_UpdatedBy", updatedBy);
        p.Add("p_AmountTendered", amountTendered);

        await conn.ExecuteAsync("public.sp_Payment_UpdateStatus", p, commandType: CommandType.StoredProcedure);
    }

    public async Task<IReadOnlyList<PaymentDto>> GetByBookingIdAsync(int bookingId)
    {
        using var conn = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_BookingId", bookingId);

        var list = await conn.QueryAsync<PaymentDto>("public.sp_Payment_GetByBookingId", p, commandType: CommandType.StoredProcedure);
        return list.ToList();
    }

    public async Task<PaymentDto?> GetByIdAsync(int paymentId)
    {
        using var conn = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_Id", paymentId);

        return await conn.QuerySingleOrDefaultAsync<PaymentDto>("public.sp_Payment_GetById", p, commandType: CommandType.StoredProcedure);
    }
}
