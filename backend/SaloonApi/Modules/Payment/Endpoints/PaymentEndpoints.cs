using FluentValidation;
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Payment.Endpoints;

internal static class PaymentEndpoints
{
    public static void MapPaymentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/payments").WithTags("Payment");

        group.MapPost("/create-intent", async (CreateIntentEndpointRequest req, ICurrentUser currentUser, PaymentService svc, CancellationToken ct) =>
        {
            if (!Enum.TryParse<PaymentProvider>(req.Provider, true, out var provider))
            {
                return Results.Problem($"Invalid payment provider '{req.Provider}'.", statusCode: StatusCodes.Status400BadRequest);
            }

            var userId = currentUser.RequireUserId();
            var response = await svc.CreatePaymentIntentAsync(
                bookingId: req.BookingId,
                customerId: userId,
                provider: provider,
                paymentMethod: req.PaymentMethod ?? "card",
                currency: req.Currency ?? "USD",
                amount: req.Amount,
                tipAmount: req.TipAmount ?? 0,
                ct: ct
            );

            return Results.Ok(response);
        }).RequireAuthorization()
          .WithValidation<CreateIntentEndpointRequest>()
          .Produces<CreatePaymentResponse>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Create a payment intent for a booking (Stripe, Cash, or InHouse terminal).");

        group.MapPost("/confirm-manual", async (ConfirmManualEndpointRequest req, ICurrentUser currentUser, PaymentService svc, CancellationToken ct) =>
        {
            var userId = currentUser.RequireUserId();
            var result = await svc.ProcessManualPaymentAsync(
                paymentId: req.PaymentId,
                userId: userId,
                success: req.Success,
                transactionId: req.TransactionId,
                failureReason: req.FailureReason,
                amountTendered: req.AmountTendered,
                ct: ct
            );

            return Results.Ok(result);
        }).RequireAuthorization()
          .WithValidation<ConfirmManualEndpointRequest>()
          .Produces<PaymentResultDto>()
          .WithDescription("Confirm or record a manual/offline payment (Cash or POS Terminal).");

        group.MapPost("/verify-checkout-session", async (VerifyCheckoutSessionEndpointRequest req, PaymentService svc, CancellationToken ct) =>
        {
            var result = await svc.VerifyCheckoutSessionAsync(req.SessionId, req.BookingId, ct);
            return Results.Ok(result);
        }).AllowAnonymous()
          .WithValidation<VerifyCheckoutSessionEndpointRequest>()
          .Produces<PaymentResultDto>()
          .WithDescription("Verify Stripe Checkout Session status and confirm booking if paid.");

        group.MapGet("/booking/{bookingId:int}", async (int bookingId, PaymentService svc) =>
        {
            var payments = await svc.GetByBookingIdAsync(bookingId);
            return Results.Ok(payments);
        }).RequireAuthorization()
          .Produces<IReadOnlyList<PaymentDto>>()
          .WithDescription("Get payment details for a booking.");

        app.MapPost("/api/payments/stripe-webhook", async (HttpContext ctx, PaymentService svc, CancellationToken ct) =>
        {
            using var reader = new StreamReader(ctx.Request.Body);
            var payload = await reader.ReadToEndAsync(ct);
            var signature = ctx.Request.Headers["Stripe-Signature"].ToString();

            var result = await svc.ProcessWebhookAsync(PaymentProvider.Stripe, payload, signature, ct);
            return result.Handled ? Results.Ok() : Results.BadRequest(result.EventType);
        }).AllowAnonymous()
          .WithTags("Payment")
          .WithDescription("Stripe webhook listener.");
    }
}

internal sealed record CreateIntentEndpointRequest(
    int BookingId,
    string Provider,
    string? PaymentMethod = "card",
    string? Currency = "USD",
    decimal? Amount = null,
    decimal? TipAmount = null
);

internal sealed record ConfirmManualEndpointRequest(
    int PaymentId,
    bool Success,
    string? TransactionId = null,
    string? FailureReason = null,
    decimal? AmountTendered = null
);

internal sealed record VerifyCheckoutSessionEndpointRequest(
    string SessionId,
    int BookingId
);

internal sealed class CreateIntentEndpointRequestValidator : AbstractValidator<CreateIntentEndpointRequest>
{
    public CreateIntentEndpointRequestValidator()
    {
        RuleFor(x => x.BookingId).GreaterThan(0);
        RuleFor(x => x.Provider).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0).When(x => x.Amount.HasValue);
        RuleFor(x => x.TipAmount).GreaterThanOrEqualTo(0).When(x => x.TipAmount.HasValue);
    }
}

internal sealed class ConfirmManualEndpointRequestValidator : AbstractValidator<ConfirmManualEndpointRequest>
{
    public ConfirmManualEndpointRequestValidator()
    {
        RuleFor(x => x.PaymentId).GreaterThan(0);
        RuleFor(x => x.AmountTendered).GreaterThanOrEqualTo(0).When(x => x.AmountTendered.HasValue);
    }
}

internal sealed class VerifyCheckoutSessionEndpointRequestValidator : AbstractValidator<VerifyCheckoutSessionEndpointRequest>
{
    public VerifyCheckoutSessionEndpointRequestValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
        RuleFor(x => x.BookingId).GreaterThan(0);
    }
}
