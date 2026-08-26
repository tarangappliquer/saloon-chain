using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Payment.Application;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class PaymentDbService
{
    public Task<int> sp_Payment_CreateAsync(
        IDbConnection db, int bookingId, decimal amount, string currency, string provider, string paymentMethod, string status,
        string? transactionId, string? clientSecret, int? createdBy, decimal tipAmount)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        args.Add("Amount", amount, DbType.Decimal);
        args.Add("Currency", currency, DbType.String);
        args.Add("Provider", provider, DbType.String);
        args.Add("PaymentMethod", paymentMethod, DbType.String);
        args.Add("Status", status, DbType.String);
        args.Add("TransactionId", transactionId, DbType.String);
        args.Add("ClientSecret", clientSecret, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        args.Add("TipAmount", tipAmount, DbType.Decimal);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Payment_Create(@BookingId, @Amount, @Currency, @Provider, @PaymentMethod, @Status, @TransactionId, @ClientSecret, @CreatedBy, @TipAmount)",
            args, commandType: CommandType.Text);
    }

    public async Task sp_Payment_UpdateStatusAsync(
        IDbConnection db, int paymentId, string status, string? transactionId, string? failureReason, int? updatedBy, decimal? amountTendered)
    {
        var args = new DynamicParameters();
        args.Add("PaymentId", paymentId, DbType.Int32);
        args.Add("Status", status, DbType.String);
        args.Add("TransactionId", transactionId, DbType.String);
        args.Add("FailureReason", failureReason, DbType.String);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        args.Add("AmountTendered", amountTendered, DbType.Decimal);
        await db.ExecuteAsync("CALL public.sp_Payment_UpdateStatus(@PaymentId, @Status, @TransactionId, @FailureReason, @UpdatedBy, @AmountTendered)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<PaymentDto>> sp_Payment_GetByBookingIdAsync(IDbConnection db, int bookingId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        return db.QueryAsync<PaymentDto>("SELECT * FROM public.sp_Payment_GetByBookingId(@BookingId)", args, commandType: CommandType.Text);
    }

    public Task<PaymentDto?> sp_Payment_GetByIdAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<PaymentDto>("SELECT * FROM public.sp_Payment_GetById(@Id)", args, commandType: CommandType.Text);
    }
}
