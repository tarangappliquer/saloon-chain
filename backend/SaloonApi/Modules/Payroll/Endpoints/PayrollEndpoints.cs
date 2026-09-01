using FluentValidation;
using SaloonApi.Modules.Payroll.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Payroll.Endpoints;

internal static class PayrollEndpoints
{
    public static void MapPayrollEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/payroll").RequireAuthorization("AdminAccess").WithTags("Payroll")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/commission-rules", async (int? locationId, ICurrentUser currentUser, PayrollRepository repo) =>
        {
            var locId = locationId ?? currentUser.LocationId ?? 0;
            if (locId == 0) return Results.Ok(Array.Empty<CommissionRuleDto>());

            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(await repo.GetCommissionRulesAsync(locId));
        }).Produces<IReadOnlyList<CommissionRuleDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's commission rules (therapist-specific and the location default).");

        // TherapistId null in the request sets/replaces the location's own default rule.
        group.MapPost("/commission-rules", async (CommissionRuleRequest req, ICurrentUser currentUser, PayrollRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(new IdResponse(await repo.UpsertCommissionRuleAsync(
                req.LocationId, req.TherapistId, req.Type, req.Rate, req.HourlyRate ?? 0, req.OvertimeThresholdHours ?? 40.0m, req.OvertimeRateMultiplier ?? 1.5m, currentUser.UserId)));
        }).WithValidation<CommissionRuleRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create or replace a commission rule for a therapist, or the location's default rule.");

        group.MapDelete("/commission-rules/{id:int}", async (int id, PayrollRepository repo) =>
        {
            await repo.DeleteCommissionRuleAsync(id);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Delete a commission rule.");

        group.MapGet("/pay-runs", async (int? locationId, ICurrentUser currentUser, PayrollRepository repo) =>
        {
            var locId = locationId ?? currentUser.LocationId ?? 0;
            if (locId == 0) return Results.Ok(Array.Empty<PayRunDto>());

            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(await repo.GetPayRunsAsync(locId));
        }).Produces<IReadOnlyList<PayRunDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's pay runs, most recent period first.");

        group.MapGet("/pay-runs/{id:int}", async (int id, PayrollRepository repo) =>
        {
            var detail = await repo.GetPayRunDetailAsync(id);
            return detail.Header is null ? Results.NotFound() : Results.Ok(detail);
        }).Produces<PayRunDetailDto>()
          .ProducesProblem(StatusCodes.Status404NotFound)
          .WithDescription("Get a pay run's header and per-therapist commission lines.");

        group.MapPost("/pay-runs", async (CreatePayRunRequest req, ICurrentUser currentUser, PayrollRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(new IdResponse(await repo.CreatePayRunAsync(req.LocationId, req.PeriodStart, req.PeriodEnd, currentUser.UserId)));
        }).WithValidation<CreatePayRunRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Generate a pay run: snapshots each therapist's gross Confirmed revenue and resolved commission for the period.");

        group.MapPost("/pay-runs/{id:int}/finalize", async (int id, ICurrentUser currentUser, PayrollRepository repo) =>
        {
            await repo.FinalizePayRunAsync(id, currentUser.UserId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Lock a Draft pay run so it's no longer regenerable.");
    }
}

internal sealed record IdResponse(int Id);
internal sealed record CommissionRuleRequest(int LocationId, int? TherapistId, string Type, decimal Rate, decimal? HourlyRate = 0, decimal? OvertimeThresholdHours = 40.0m, decimal? OvertimeRateMultiplier = 1.5m);
internal sealed record CreatePayRunRequest(int LocationId, DateOnly PeriodStart, DateOnly PeriodEnd);

internal sealed class CommissionRuleRequestValidator : AbstractValidator<CommissionRuleRequest>
{
    public CommissionRuleRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.Type).Must(t => t is "Percent" or "Flat" or "Hourly").WithMessage("Type must be 'Percent', 'Flat', or 'Hourly'.");
        RuleFor(x => x.Rate).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Rate).LessThanOrEqualTo(100).When(x => x.Type == "Percent").WithMessage("Commission percentage cannot exceed 100%.");
        RuleFor(x => x.HourlyRate).GreaterThanOrEqualTo(0).When(x => x.HourlyRate.HasValue);
        RuleFor(x => x.OvertimeThresholdHours).GreaterThanOrEqualTo(0).When(x => x.OvertimeThresholdHours.HasValue);
        RuleFor(x => x.OvertimeRateMultiplier).GreaterThanOrEqualTo(1.0m).When(x => x.OvertimeRateMultiplier.HasValue);
    }
}

internal sealed class CreatePayRunRequestValidator : AbstractValidator<CreatePayRunRequest>
{
    public CreatePayRunRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.PeriodEnd).GreaterThanOrEqualTo(x => x.PeriodStart);
    }
}
