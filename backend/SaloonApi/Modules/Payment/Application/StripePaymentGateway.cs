using System.Globalization;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using SaloonApi.Modules.Payment.Infrastructure;
using Stripe;

namespace SaloonApi.Modules.Payment.Application;

internal sealed class StripePaymentGateway(IOptions<StripeOptions> options) : IPaymentGateway
{
    private readonly StripeOptions _options = options.Value;

    public PaymentProvider Provider => PaymentProvider.Stripe;

    public async Task<PaymentResultDto> CreatePaymentAsync(
        int bookingId, decimal amount, string currency, string paymentMethod, string? stripeCustomerId = null, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(currency);

        if (string.IsNullOrEmpty(_options.SecretKey))
        {
            var mockId = $"pi_mock_{Guid.NewGuid():N}";
            return new PaymentResultDto(
                Success: true,
                PaymentId: 0,
                Status: PaymentStatus.RequiresAction,
                TransactionId: mockId,
                ErrorMessage: null
            );
        }

        StripeConfiguration.ApiKey = _options.SecretKey;
        var service = new PaymentIntentService();

        var amountInCents = (long)Math.Round(amount * 100);
#pragma warning disable CA1308 // Stripe API requires lowercase currency codes
        var intentCreateOptions = new PaymentIntentCreateOptions
        {
            Amount = amountInCents,
            Currency = currency.ToLowerInvariant(),
            PaymentMethodTypes = ["card"],
            Customer = stripeCustomerId,
            Metadata = new Dictionary<string, string>
            {
                { "bookingId", bookingId.ToString(CultureInfo.InvariantCulture) }
            }
        };
#pragma warning restore CA1308

        try
        {
            var intent = await service.CreateAsync(intentCreateOptions, cancellationToken: ct);
            return new PaymentResultDto(
                Success: true,
                PaymentId: 0,
                Status: PaymentStatus.RequiresAction,
                TransactionId: intent.Id,
                ErrorMessage: null
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
            if (!string.IsNullOrEmpty(_options.WebhookSecret) && !string.IsNullOrEmpty(signatureHeader))
            {
                stripeEvent = EventUtility.ConstructEvent(payload, signatureHeader, _options.WebhookSecret);
            }
            else
            {
                stripeEvent = EventUtility.ParseEvent(payload, throwOnApiVersionMismatch: false);
            }

            int? bookingId = null;
            string? transactionId = null;
            PaymentStatus? newStatus = null;

            if (stripeEvent.Data?.Object is PaymentIntent paymentIntent)
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
                    transactionId = dataObj["id"]?.ToString();
                    var bIdStr = dataObj["metadata"]?["bookingId"]?.ToString();
                    if (!string.IsNullOrEmpty(bIdStr) && int.TryParse(bIdStr, CultureInfo.InvariantCulture, out var bId))
                    {
                        bookingId = bId;
                    }
                }
            }

            newStatus = stripeEvent.Type switch
            {
                EventTypes.PaymentIntentSucceeded or EventTypes.ChargeSucceeded => PaymentStatus.Succeeded,
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
    }
}
