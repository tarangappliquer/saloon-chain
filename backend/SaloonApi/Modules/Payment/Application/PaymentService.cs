using Microsoft.Extensions.Options;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Payment.Infrastructure;

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
                if (result.NewStatus == PaymentStatus.Succeeded)
                {
                    var customerId = latest.CreatedBy ?? 0;
                    await bookingService.ConfirmAsync(result.PaymentId.Value, customerId);
                }
            }
        }

        return result;
    }

    public Task<IReadOnlyList<PaymentDto>> GetByBookingIdAsync(int bookingId) => repo.GetByBookingIdAsync(bookingId);
}
