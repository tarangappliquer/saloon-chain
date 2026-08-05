namespace SaloonApi.Modules.Payment.Application;

internal sealed class CashPaymentGateway : IPaymentGateway
{
    public PaymentProvider Provider => PaymentProvider.Cash;

    public Task<PaymentResultDto> CreatePaymentAsync(
        int bookingId, decimal amount, string currency, string paymentMethod, string? stripeCustomerId = null, CancellationToken ct = default)
    {
        var transactionId = $"cash_{bookingId}_{DateTime.UtcNow.Ticks}";
        return Task.FromResult(new PaymentResultDto(
            Success: true,
            PaymentId: 0,
            Status: PaymentStatus.Pending,
            TransactionId: transactionId,
            ErrorMessage: null
        ));
    }

    public Task<PaymentResultDto> ProcessManualPaymentAsync(
        int paymentId, bool success, string? transactionId, string? failureReason, CancellationToken ct = default)
    {
        var status = success ? PaymentStatus.Succeeded : PaymentStatus.Failed;
        return Task.FromResult(new PaymentResultDto(
            Success: success,
            PaymentId: paymentId,
            Status: status,
            TransactionId: transactionId ?? $"cash_tx_{paymentId}",
            ErrorMessage: failureReason
        ));
    }

    public Task<WebhookProcessResult> ProcessWebhookAsync(
        string payload, string signatureHeader, CancellationToken ct = default)
    {
        return Task.FromResult(new WebhookProcessResult(false, "unsupported_cash_webhook", null, null, null));
    }
}
