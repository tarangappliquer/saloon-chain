namespace SaloonApi.Modules.Payment.Application;

internal enum PaymentProvider
{
    Stripe,
    Cash,
    InHouse
}

internal enum PaymentStatus
{
    Pending,
    RequiresAction,
    Succeeded,
    Failed,
    Cancelled,
    Refunded
}

internal sealed record CreatePaymentIntentRequest(
    int BookingId,
    PaymentProvider Provider,
    string PaymentMethod = "card",
    string Currency = "USD"
);

internal sealed record CreatePaymentResponse(
    int PaymentId,
    int BookingId,
    decimal Amount,
    string Currency,
    PaymentProvider Provider,
    PaymentStatus Status,
    string? ClientSecret,
    string? TransactionId,
    string? PublishableKey,
    string? CheckoutUrl = null
);

internal sealed record ProcessManualPaymentRequest(
    int PaymentId,
    int BookingId,
    PaymentProvider Provider,
    bool Success,
    string? TransactionId = null,
    string? FailureReason = null
);

internal sealed record PaymentResultDto(
    bool Success,
    int PaymentId,
    PaymentStatus Status,
    string? TransactionId,
    string? ErrorMessage,
    string? CheckoutUrl = null
);

internal sealed record WebhookProcessResult(
    bool Handled,
    string EventType,
    int? PaymentId,
    PaymentStatus? NewStatus,
    string? TransactionId
);

internal sealed record PaymentDto(
    int Id,
    int BookingId,
    decimal Amount,
    string Currency,
    string Provider,
    string PaymentMethod,
    string Status,
    string? TransactionId,
    string? ClientSecret,
    string? FailureReason,
    int? CreatedBy,
    DateTime CreatedDate
);
