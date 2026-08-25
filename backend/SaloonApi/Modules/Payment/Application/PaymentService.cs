using Microsoft.Extensions.Options;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Inventory.Infrastructure;
using SaloonApi.Modules.Payment.Infrastructure;
using Stripe;

namespace SaloonApi.Modules.Payment.Application;

internal sealed class PaymentService(
    IPaymentGatewayFactory factory,
    PaymentRepository repo,
    BookingService bookingService,
    UserRepository userRepo,
    InventoryRepository inventoryRepo,
    StripeCustomerService stripeCustomerService,
    IOptionsMonitor<StripeOptions> stripeOptions)
{
    public async Task<CreatePaymentResponse> CreatePaymentIntentAsync(
        int bookingId, int customerId, PaymentProvider provider, string paymentMethod = "card", string currency = "USD",
        decimal? amount = null, decimal tipAmount = 0, CancellationToken ct = default)
    {
        if (tipAmount < 0)
        {
            throw new InvalidOperationException("Tip amount cannot be negative.");
        }

        var booking = await bookingService.GetByIdAsync(bookingId, customerId)
            ?? throw new KeyNotFoundException($"Booking {bookingId} not found for customer.");

        // Retail lines (BookingProducts) ride along with a booking's treatment total -- fetched
        // separately rather than threading Products through BookingDetailsDto, which several other
        // call sites (confirmation/cancellation emails) already depend on the shape of.
        var productTotal = (await inventoryRepo.GetBookingProductsAsync(bookingId)).Sum(p => p.LineTotal);
        var bookingTotal = booking.Treatments.Sum(t => t.Price) + productTotal;
        var existingPayments = await repo.GetByBookingIdAsync(bookingId);
        var alreadyPaid = existingPayments
            .Where(p => p.Status.Equals("Succeeded", StringComparison.OrdinalIgnoreCase))
            .Sum(p => p.Amount);

        var chargeAmount = ResolveChargeAmount(bookingTotal, alreadyPaid, amount);

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

        var result = await gateway.CreatePaymentAsync(bookingId, chargeAmount + tipAmount, currency, paymentMethod, stripeCustomerId, ct);

        var paymentId = await repo.CreateAsync(
            bookingId: bookingId,
            amount: chargeAmount,
            currency: currency,
            provider: provider.ToString(),
            paymentMethod: paymentMethod,
            status: result.Status.ToString(),
            transactionId: result.TransactionId,
            clientSecret: result.TransactionId != null ? $"{result.TransactionId}_secret" : null,
            createdBy: customerId,
            tipAmount: tipAmount
        );

        return new CreatePaymentResponse(
            PaymentId: paymentId,
            BookingId: bookingId,
            Amount: chargeAmount,
            Currency: currency,
            Provider: provider,
            Status: result.Status,
            ClientSecret: result.TransactionId != null ? $"{result.TransactionId}_secret" : null,
            TransactionId: result.TransactionId,
            PublishableKey: provider == PaymentProvider.Stripe ? stripeOptions.CurrentValue.PublishableKey : null,
            CheckoutUrl: result.CheckoutUrl,
            TipAmount: tipAmount
        );
    }

    public async Task<PaymentResultDto> ProcessManualPaymentAsync(
        int paymentId, int userId, bool success, string? transactionId = null, string? failureReason = null,
        decimal? amountTendered = null, CancellationToken ct = default)
    {
        var payment = await repo.GetByIdAsync(paymentId)
            ?? throw new KeyNotFoundException($"Payment {paymentId} not found.");

        if (!Enum.TryParse<PaymentProvider>(payment.Provider, out var provider))
        {
            provider = PaymentProvider.Cash;
        }

        // This endpoint exists only to record an offline/in-person payment a staff member
        // witnessed directly (Cash, InHouse terminal). A Stripe payment must only ever be marked
        // Succeeded by the checkout-session verification or the Stripe webhook, which independently
        // confirm the charge with Stripe -- letting this path touch a Stripe payment would let
        // anyone who can reach it mark an unpaid Stripe booking as paid.
        if (provider == PaymentProvider.Stripe)
        {
            throw new InvalidOperationException("Stripe payments cannot be confirmed manually.");
        }

        if (success && provider == PaymentProvider.Cash)
        {
            var owed = payment.Amount + payment.TipAmount;
            if (amountTendered is null || amountTendered < owed)
            {
                throw new InvalidOperationException(
                    $"Amount tendered ({amountTendered:0.00}) is less than the amount owed ({owed:0.00}).");
            }
        }

        var gateway = factory.GetGateway(provider);
        var result = await gateway.ProcessManualPaymentAsync(paymentId, success, transactionId, failureReason, ct);

        await repo.UpdateStatusAsync(paymentId, result.Status.ToString(), result.TransactionId, failureReason, updatedBy: userId, amountTendered: amountTendered);

        if (result.Success && result.Status == PaymentStatus.Succeeded)
        {
            await bookingService.ConfirmAsync(payment.BookingId, 0);
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
                await bookingService.ConfirmAsync(result.PaymentId.Value, 0);
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

        StripeConfiguration.ApiKey = stripeOptions.CurrentValue.SecretKey;
        if (string.IsNullOrEmpty(stripeOptions.CurrentValue.SecretKey))
        {
            // Dev mock fallback
            await bookingService.ConfirmAsync(bookingId, 0);
            return new PaymentResultDto(true, 0, PaymentStatus.Succeeded, sessionId, null);
        }

        var sessionService = new Stripe.Checkout.SessionService();
        var session = await sessionService.GetAsync(sessionId, cancellationToken: ct);

        // Session id and bookingId are both caller-supplied and independent -- without this check
        // a paid session for one (cheap) booking could be replayed against any other bookingId to
        // confirm it for free. Metadata.bookingId is set server-side at session creation
        // (StripePaymentGateway.CreatePaymentAsync) so it's the trustworthy side of the comparison.
        var sessionBookingId = session?.Metadata != null
            && session.Metadata.TryGetValue("bookingId", out var metaBookingId)
            && int.TryParse(metaBookingId, System.Globalization.CultureInfo.InvariantCulture, out var parsedBookingId)
                ? parsedBookingId
                : (int?)null;

        if (session != null && sessionBookingId != bookingId)
        {
            return new PaymentResultDto(false, 0, PaymentStatus.Failed, session.Id, "Session does not match booking.");
        }

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

            await bookingService.ConfirmAsync(bookingId, 0);
            return new PaymentResultDto(true, latest?.Id ?? 0, PaymentStatus.Succeeded, session.PaymentIntentId ?? session.Id, null);
        }

        return new PaymentResultDto(false, 0, PaymentStatus.Failed, session?.Id, "Payment not completed.");
    }

    public Task<IReadOnlyList<PaymentDto>> GetByBookingIdAsync(int bookingId) => repo.GetByBookingIdAsync(bookingId);

    public async Task<int?> GetBookingIdAsync(int paymentId) => (await repo.GetByIdAsync(paymentId))?.BookingId;

    /// <summary>
    /// Resolves how much a new payment intent should charge given what's already been paid on the booking.
    /// Pure/no I-O so it's directly unit-testable — covers deposits (requestedAmount &lt; remaining) and
    /// split payments (repeated calls against a shrinking remaining balance).
    /// </summary>
    internal static decimal ResolveChargeAmount(decimal bookingTotal, decimal alreadyPaid, decimal? requestedAmount)
    {
        var remainingBalance = bookingTotal - alreadyPaid;
        var chargeAmount = requestedAmount ?? remainingBalance;

        if (chargeAmount <= 0 || chargeAmount > remainingBalance)
        {
            throw new InvalidOperationException(
                $"Requested amount {chargeAmount:0.00} is invalid; remaining balance is {remainingBalance:0.00}.");
        }

        return chargeAmount;
    }
}
