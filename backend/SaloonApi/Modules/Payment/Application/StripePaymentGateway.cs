using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using SaloonApi.Modules.Payment.Infrastructure;
using SaloonApi.Shared.Auth;
using Stripe;
using System.Globalization;

namespace SaloonApi.Modules.Payment.Application;

internal sealed class StripePaymentGateway(IOptionsMonitor<StripeOptions> options, IOptionsMonitor<PortalUrlOptions> portalOptions, ILogger<StripePaymentGateway> logger) : IPaymentGateway
{
    private StripeOptions _options => options.CurrentValue;
    private PortalUrlOptions _portalOptions => portalOptions.CurrentValue;

    public PaymentProvider Provider => PaymentProvider.Stripe;

    public async Task<PaymentResultDto> CreatePaymentAsync(
        int bookingId, decimal amount, string currency, string paymentMethod, string? stripeCustomerId = null, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(currency);

        var amountInCents = (long)Math.Round(amount * 100);

        if (string.IsNullOrEmpty(_options.SecretKey))
        {
            var mockId = $"cs_test_{Guid.NewGuid():N}";
            return new PaymentResultDto(
                Success: true,
                PaymentId: 0,
                Status: PaymentStatus.RequiresAction,
                TransactionId: mockId,
                ErrorMessage: null,
                CheckoutUrl: $"https://checkout.stripe.com/pay/{mockId}"
            );
        }

        StripeConfiguration.ApiKey = _options.SecretKey;
        var sessionService = new Stripe.Checkout.SessionService();

#pragma warning disable S1075 // Fallback URL for local dev
        var baseUrl = (string.IsNullOrEmpty(_portalOptions.ClientPortalUrl) ? "http://localhost:58569" : _portalOptions.ClientPortalUrl).TrimEnd('/');
#pragma warning restore S1075

#pragma warning disable CA1308 // Stripe API requires lowercase currency codes
        var sessionOptions = new Stripe.Checkout.SessionCreateOptions
        {
            PaymentMethodTypes = ["card"],
            LineItems = [
                new Stripe.Checkout.SessionLineItemOptions
                {
                    PriceData = new Stripe.Checkout.SessionLineItemPriceDataOptions
                    {
                        UnitAmount = amountInCents,
                        Currency = currency.ToLowerInvariant(),
                        ProductData = new Stripe.Checkout.SessionLineItemPriceDataProductDataOptions
                        {
                            Name = $"Saloon Appointment #{bookingId}",
                            Description = "SaloonChains appointment booking checkout"
                        }
                    },
                    Quantity = 1
                }
            ],
            Mode = "payment",
            SuccessUrl = $"{baseUrl}/book/confirmed?bookingId={bookingId}&session_id={{CHECKOUT_SESSION_ID}}",
            CancelUrl = $"{baseUrl}/book/{bookingId}/payment",
            Customer = stripeCustomerId,
            Metadata = new Dictionary<string, string>
            {
                { "bookingId", bookingId.ToString(CultureInfo.InvariantCulture) }
            }
        };
#pragma warning restore CA1308

        try
        {
            var session = await sessionService.CreateAsync(sessionOptions, cancellationToken: ct);
            return new PaymentResultDto(
                Success: true,
                PaymentId: 0,
                Status: PaymentStatus.RequiresAction,
                TransactionId: session.Id,
                ErrorMessage: null,
                CheckoutUrl: session.Url
            );
        }
        catch (StripeException ex)
        {
            return new PaymentResultDto(
                Success: false,
                PaymentId: 0,
                Status: PaymentStatus.Failed,
                TransactionId: null,
                ErrorMessage: ex.Message
            );
        }
    }

    public Task<PaymentResultDto> ProcessManualPaymentAsync(
        int paymentId, bool success, string? transactionId, string? failureReason, CancellationToken ct = default)
    {
        var status = success ? PaymentStatus.Succeeded : PaymentStatus.Failed;
        return Task.FromResult(new PaymentResultDto(
            Success: success,
            PaymentId: paymentId,
            Status: status,
            TransactionId: transactionId,
            ErrorMessage: failureReason
        ));
    }

    public async Task<WebhookProcessResult> ProcessWebhookAsync(
        string payload, string signatureHeader, CancellationToken ct = default)
    {
        try
        {
            Event stripeEvent;
            if (!string.IsNullOrEmpty(signatureHeader) && !string.IsNullOrEmpty(_options.WebhookSecret))
            {
                stripeEvent = EventUtility.ConstructEvent(payload, signatureHeader, _options.WebhookSecret, throwOnApiVersionMismatch: false);
            }
            else
            {
                stripeEvent = EventUtility.ParseEvent(payload, throwOnApiVersionMismatch: false);
            }

            int? bookingId = null;
            string? transactionId = null;
            PaymentStatus? newStatus = null;

            if (stripeEvent.Data?.Object is Stripe.Checkout.Session session)
            {
                transactionId = session.PaymentIntentId ?? session.Id;
                if (session.Metadata != null && session.Metadata.TryGetValue("bookingId", out var bIdStr) && int.TryParse(bIdStr, CultureInfo.InvariantCulture, out var bId))
                {
                    bookingId = bId;
                }
            }
            else if (stripeEvent.Data?.Object is PaymentIntent paymentIntent)
            {
                transactionId = paymentIntent.Id;
                if (paymentIntent.Metadata != null && paymentIntent.Metadata.TryGetValue("bookingId", out var bIdStr) && int.TryParse(bIdStr, CultureInfo.InvariantCulture, out var bId))
                {
                    bookingId = bId;
                }
            }
            else if (stripeEvent.Data?.Object is Charge charge)
            {
                transactionId = charge.PaymentIntentId ?? charge.Id;
                if (charge.Metadata != null && charge.Metadata.TryGetValue("bookingId", out var bIdStr) && int.TryParse(bIdStr, CultureInfo.InvariantCulture, out var bId))
                {
                    bookingId = bId;
                }
            }
            else if (!string.IsNullOrEmpty(payload))
            {
                var json = JObject.Parse(payload);
                var dataObj = json["data"]?["object"] as JObject;
                if (dataObj != null)
                {
                    transactionId = dataObj["payment_intent"]?.ToString() ?? dataObj["id"]?.ToString();
                    var bIdStr = dataObj["metadata"]?["bookingId"]?.ToString();
                    if (!string.IsNullOrEmpty(bIdStr) && int.TryParse(bIdStr, CultureInfo.InvariantCulture, out var bId))
                    {
                        bookingId = bId;
                    }
                }
            }

            newStatus = stripeEvent.Type switch
            {
                EventTypes.CheckoutSessionCompleted or EventTypes.PaymentIntentSucceeded or EventTypes.ChargeSucceeded => PaymentStatus.Succeeded,
                EventTypes.PaymentIntentPaymentFailed or EventTypes.ChargeFailed => PaymentStatus.Failed,
                EventTypes.PaymentIntentCanceled => PaymentStatus.Cancelled,
                EventTypes.ChargeRefunded => PaymentStatus.Refunded,
                _ => null
            };

            if (newStatus.HasValue)
            {
                return await Task.FromResult(new WebhookProcessResult(
                    Handled: true,
                    EventType: stripeEvent.Type,
                    PaymentId: bookingId,
                    NewStatus: newStatus,
                    TransactionId: transactionId
                ));
            }

            return await Task.FromResult(new WebhookProcessResult(false, stripeEvent.Type, null, null, null));
        }
        catch (StripeException ex)
        {
            return await Task.FromResult(new WebhookProcessResult(false, ex.Message, null, null, null));
        }
#pragma warning disable CA1031 // Do not catch general exception types
        catch (Exception ex1)
        {
            logger.LogError(ex1, "Error processing Stripe webhook");
            return await Task.FromResult(new WebhookProcessResult(false, ex1.Message, null, null, null));
        }
#pragma warning restore CA1031
    }

    public async Task<PaymentResultDto> RefundAsync(
        string? transactionId, decimal amount, string? reason, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(transactionId))
        {
            return new PaymentResultDto(false, 0, PaymentStatus.Failed, null, "No transaction id to refund.");
        }

        if (string.IsNullOrEmpty(_options.SecretKey))
        {
            // Dev mock fallback
            return new PaymentResultDto(true, 0, PaymentStatus.Refunded, $"re_mock_{Guid.NewGuid():N}", null);
        }

        StripeConfiguration.ApiKey = _options.SecretKey;
        var refundService = new Stripe.RefundService();

        try
        {
            // transactionId is normally the PaymentIntent id (pi_...) captured on success; falls back to the
            // checkout session id (cs_...) only if Stripe never reported one back, which Refund can't accept.
            var refund = await refundService.CreateAsync(new RefundCreateOptions
            {
                PaymentIntent = transactionId,
                Amount = (long)Math.Round(amount * 100),
                Reason = "requested_by_customer"
            }, cancellationToken: ct);

            return new PaymentResultDto(true, 0, PaymentStatus.Refunded, refund.Id, null);
        }
        catch (StripeException ex)
        {
            logger.LogError(ex, "Stripe refund failed for transaction {TransactionId}", transactionId);
            return new PaymentResultDto(false, 0, PaymentStatus.Failed, null, ex.Message);
        }
    }
}
