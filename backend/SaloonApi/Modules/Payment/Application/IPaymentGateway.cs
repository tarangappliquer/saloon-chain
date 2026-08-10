namespace SaloonApi.Modules.Payment.Application;

internal interface IPaymentGateway
{
    PaymentProvider Provider { get; }

    Task<PaymentResultDto> CreatePaymentAsync(
        int bookingId, decimal amount, string currency, string paymentMethod, string? stripeCustomerId = null, CancellationToken ct = default);

    Task<PaymentResultDto> ProcessManualPaymentAsync(
        int paymentId, bool success, string? transactionId, string? failureReason, CancellationToken ct = default);

    Task<WebhookProcessResult> ProcessWebhookAsync(
        string payload, string signatureHeader, CancellationToken ct = default);

    Task<PaymentResultDto> RefundAsync(
        string? transactionId, decimal amount, string? reason, CancellationToken ct = default);
}
