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
                ct: ct
            );

            return Results.Ok(result);
        }).RequireAuthorization()
          .WithValidation<ConfirmManualEndpointRequest>()
          .Produces<PaymentResultDto>()
          .WithDescription("Confirm or record a manual/offline payment (Cash or POS Terminal).");

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
    string? Currency = "USD"
);

internal sealed record ConfirmManualEndpointRequest(
    int PaymentId,
    bool Success,
    string? TransactionId = null,
    string? FailureReason = null
);

internal sealed class CreateIntentEndpointRequestValidator : AbstractValidator<CreateIntentEndpointRequest>
{
    public CreateIntentEndpointRequestValidator()
    {
        RuleFor(x => x.BookingId).GreaterThan(0);
        RuleFor(x => x.Provider).NotEmpty();
    }
}

internal sealed class ConfirmManualEndpointRequestValidator : AbstractValidator<ConfirmManualEndpointRequest>
{
    public ConfirmManualEndpointRequestValidator()
    {
        RuleFor(x => x.PaymentId).GreaterThan(0);
    }
}
