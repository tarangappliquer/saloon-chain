using System.Globalization;
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Modules.Payment.Infrastructure;
using Xunit;

namespace SaloonApi.Tests;

public class PaymentWebhookTests
{
    [Fact]
    public async Task ProcessWebhookAsyncParsesPaymentIntentSucceededPayload()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new StripeOptions { WebhookSecret = "" });
        var portalOptions = Microsoft.Extensions.Options.Options.Create(new SaloonApi.Shared.Auth.PortalUrlOptions());
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger<StripePaymentGateway>.Instance;
        var gateway = new StripePaymentGateway(options, portalOptions, logger);

        var payload = """
        {
          "id": "evt_123",
          "object": "event",
          "api_version": "2024-06-20",
          "created": 1722830000,
          "livemode": false,
          "pending_webhooks": 1,
          "request": { "id": "req_123", "idempotency_key": "key_123" },
          "type": "payment_intent.succeeded",
          "data": {
            "object": {
              "id": "pi_test_123",
              "object": "payment_intent",
              "amount": 5000,
              "currency": "usd",
              "status": "succeeded",
              "metadata": {
                "bookingId": "42"
              }
            }
          }
        }
        """;

        var result = await gateway.ProcessWebhookAsync(payload, signatureHeader: "", TestContext.Current.CancellationToken);

        Assert.True(result.Handled);
        Assert.Equal("payment_intent.succeeded", result.EventType);
        Assert.Equal(42, result.PaymentId);
        Assert.Equal(PaymentStatus.Succeeded, result.NewStatus);
        Assert.Equal("pi_test_123", result.TransactionId);
    }

    [Fact]
    public async Task ProcessWebhookAsyncParsesPaymentIntentFailedPayload()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new StripeOptions { WebhookSecret = "" });
        var portalOptions = Microsoft.Extensions.Options.Options.Create(new SaloonApi.Shared.Auth.PortalUrlOptions());
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger<StripePaymentGateway>.Instance;
        var gateway = new StripePaymentGateway(options, portalOptions, logger);

        var payload = """
        {
          "id": "evt_124",
          "object": "event",
          "api_version": "2024-06-20",
          "created": 1722830000,
          "livemode": false,
          "pending_webhooks": 1,
          "request": { "id": "req_124", "idempotency_key": "key_124" },
          "type": "payment_intent.payment_failed",
          "data": {
            "object": {
              "id": "pi_test_124",
              "object": "payment_intent",
              "amount": 5000,
              "currency": "usd",
              "status": "requires_payment_method",
              "metadata": {
                "bookingId": "99"
              }
            }
          }
        }
        """;

        var result = await gateway.ProcessWebhookAsync(payload, signatureHeader: "", TestContext.Current.CancellationToken);

        Assert.True(result.Handled);
        Assert.Equal("payment_intent.payment_failed", result.EventType);
        Assert.Equal(99, result.PaymentId);
        Assert.Equal(PaymentStatus.Failed, result.NewStatus);
        Assert.Equal("pi_test_124", result.TransactionId);
    }
}
