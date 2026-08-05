using Microsoft.Extensions.Options;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Payment.Infrastructure;
using Stripe;

namespace SaloonApi.Modules.Payment.Application;

internal sealed class PaymentService(
    IPaymentGatewayFactory factory,
    PaymentRepository repo,
    BookingService bookingService,
    UserRepository userRepo,
    StripeCustomerService stripeCustomerService,
    IOptions<StripeOptions> stripeOptions)
{
    public async Task<CreatePaymentResponse> CreatePaymentIntentAsync(
        int bookingId, int customerId, PaymentProvider provider, string paymentMethod = "card", string currency = "USD", CancellationToken ct = default)
    {
        var booking = await bookingService.GetByIdAsync(bookingId, customerId)
            ?? throw new KeyNotFoundException($"Booking {bookingId} not found for customer.");

        var totalAmount = booking.Treatments.Sum(t => t.Price);
        var gateway = factory.GetGateway(provider);

        string? stripeCustomerId = null;
        if (provider == PaymentProvider.Stripe)
        {
            var user = await userRepo.GetByIdAsync(customerId);
            if (user != null)
            {
                stripeCustomerId = await stripeCustomerService.GetOrCreateCustomerAsync(customerId, user.Name, user.Email, ct: ct);
            }
        }

        var result = await gateway.CreatePaymentAsync(bookingId, totalAmount, currency, paymentMethod, stripeCustomerId, ct);

        var paymentId = await repo.CreateAsync(
            bookingId: bookingId,
            amount: totalAmount,
            currency: currency,
            provider: provider.ToString(),
            paymentMethod: paymentMethod,
            status: result.Status.ToString(),
            transactionId: result.TransactionId,
            clientSecret: result.TransactionId != null ? $"{result.TransactionId}_secret" : null,
            createdBy: customerId
        );

        return new CreatePaymentResponse(
            PaymentId: paymentId,
            BookingId: bookingId,
            Amount: totalAmount,
            Currency: currency,
            Provider: provider,
            Status: result.Status,
            ClientSecret: result.TransactionId != null ? $"{result.TransactionId}_secret" : null,
            TransactionId: result.TransactionId,
            PublishableKey: provider == PaymentProvider.Stripe ? stripeOptions.Value.PublishableKey : null,
            CheckoutUrl: result.CheckoutUrl
        );
    }

    public async Task<PaymentResultDto> ProcessManualPaymentAsync(
        int paymentId, int userId, bool success, string? transactionId = null, string? failureReason = null, CancellationToken ct = default)
    {
        var payment = await repo.GetByIdAsync(paymentId)
            ?? throw new KeyNotFoundException($"Payment {paymentId} not found.");

        if (!Enum.TryParse<PaymentProvider>(payment.Provider, out var provider))
        {
            provider = PaymentProvider.Cash;
        }

        var gateway = factory.GetGateway(provider);
        var result = await gateway.ProcessManualPaymentAsync(paymentId, success, transactionId, failureReason, ct);

        await repo.UpdateStatusAsync(paymentId, result.Status.ToString(), result.TransactionId, failureReason, updatedBy: userId);

        if (result.Success && result.Status == PaymentStatus.Succeeded)
        {
            await bookingService.ConfirmAsync(payment.BookingId, userId);
        }

        return result;
    }

    public async Task<WebhookProcessResult> ProcessWebhookAsync(
        PaymentProvider provider, string payload, string signatureHeader, CancellationToken ct = default)
    {
        var gateway = factory.GetGateway(provider);
        var result = await gateway.ProcessWebhookAsync(payload, signatureHeader, ct);

        if (result.Handled && result.PaymentId.HasValue && result.NewStatus.HasValue)
        {
            var payments = await repo.GetByBookingIdAsync(result.PaymentId.Value);
            var latest = payments.Count > 0 ? payments[0] : null;
            if (latest != null)
            {
                await repo.UpdateStatusAsync(latest.Id, result.NewStatus.Value.ToString(), result.TransactionId);
            }
            else
            {
                await repo.CreateAsync(
                    bookingId: result.PaymentId.Value,
                    amount: 0,
                    currency: "USD",
                    provider: provider.ToString(),
                    paymentMethod: "card",
                    status: result.NewStatus.Value.ToString(),
                    transactionId: result.TransactionId,
                    clientSecret: null,
                    createdBy: null
                );
            }

            if (result.NewStatus == PaymentStatus.Succeeded)
            {
                await bookingService.ConfirmAsync(result.PaymentId.Value, latest?.CreatedBy ?? 0);
            }
        }

        return result;
    }

    public async Task<PaymentResultDto> VerifyCheckoutSessionAsync(string sessionId, int bookingId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new ArgumentException("Session ID is required", nameof(sessionId));
        }

        StripeConfiguration.ApiKey = stripeOptions.Value.SecretKey;
        if (string.IsNullOrEmpty(stripeOptions.Value.SecretKey))
        {
            // Dev mock fallback
            await bookingService.ConfirmAsync(bookingId, 0);
            return new PaymentResultDto(true, 0, PaymentStatus.Succeeded, sessionId, null);
        }

        var sessionService = new Stripe.Checkout.SessionService();
        var session = await sessionService.GetAsync(sessionId, cancellationToken: ct);

        if (session != null && string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase))
        {
            var payments = await repo.GetByBookingIdAsync(bookingId);
            var latest = payments.Count > 0 ? payments[0] : null;
            if (latest != null)
            {
                await repo.UpdateStatusAsync(latest.Id, PaymentStatus.Succeeded.ToString(), session.PaymentIntentId ?? session.Id);
            }
            else
            {
                await repo.CreateAsync(
                    bookingId: bookingId,
                    amount: (session.AmountTotal ?? 0) / 100m,
                    currency: session.Currency?.ToUpperInvariant() ?? "USD",
                    provider: PaymentProvider.Stripe.ToString(),
                    paymentMethod: "card",
                    status: PaymentStatus.Succeeded.ToString(),
                    transactionId: session.PaymentIntentId ?? session.Id,
                    clientSecret: null,
                    createdBy: null
                );
            }

            await bookingService.ConfirmAsync(bookingId, latest?.CreatedBy ?? 0);
            return new PaymentResultDto(true, latest?.Id ?? 0, PaymentStatus.Succeeded, session.PaymentIntentId ?? session.Id, null);
        }

        return new PaymentResultDto(false, 0, PaymentStatus.Failed, session?.Id, "Payment not completed.");
    }

    public Task<IReadOnlyList<PaymentDto>> GetByBookingIdAsync(int bookingId) => repo.GetByBookingIdAsync(bookingId);
}
