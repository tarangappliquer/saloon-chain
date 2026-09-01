using SaloonApi.Modules.Reports.Application;
using SaloonApi.Modules.Reports.Infrastructure;
using SaloonApi.Shared.Auth;

namespace SaloonApi.Modules.Reports.Endpoints;

internal static class ReportsEndpoints
{
    public static void MapReportsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/reports").RequireAuthorization("AdminAccess").WithTags("Reports")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/sales-by-service", async (int? locationId, DateOnly? from, DateOnly? to, string? format, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            var locId = locationId ?? currentUser.LocationId ?? 0;
            if (locId == 0) return Results.Ok(Array.Empty<SalesByServiceDto>());

            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var toDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var fromDate = from ?? toDate.AddDays(-30);

            var rows = await repo.GetSalesByServiceAsync(locId, fromDate, toDate);
            return format == "csv" ? Results.File(CsvExport.ToCsvBytes(rows), "text/csv", "sales-by-service.csv") : Results.Ok(rows);
        }).Produces<IReadOnlyList<SalesByServiceDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Confirmed-booking revenue grouped by treatment, for a date range.");

        group.MapGet("/sales-by-staff", async (int? locationId, DateOnly? from, DateOnly? to, string? format, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            var locId = locationId ?? currentUser.LocationId ?? 0;
            if (locId == 0) return Results.Ok(Array.Empty<SalesByStaffDto>());

            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var toDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var fromDate = from ?? toDate.AddDays(-30);

            var rows = await repo.GetSalesByStaffAsync(locId, fromDate, toDate);
            return format == "csv" ? Results.File(CsvExport.ToCsvBytes(rows), "text/csv", "sales-by-staff.csv") : Results.Ok(rows);
        }).Produces<IReadOnlyList<SalesByStaffDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Confirmed-booking revenue grouped by therapist, for a date range.");

        group.MapGet("/sales-by-location", async (int? chainId, DateOnly? from, DateOnly? to, string? format, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            var effectiveChainId = chainId ?? (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) ? currentUser.ChainId : null) ?? 0;
            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) && chainId is { } passedChainId && currentUser.ChainId != passedChainId)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);
            if (currentUser.IsInRole(UserRole.Manager))
                return Results.Problem("Chain-wide rollup is not available to Manager.", statusCode: StatusCodes.Status403Forbidden);
            if (effectiveChainId == 0)
                return Results.Ok(Array.Empty<SalesByLocationDto>());

            var toDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var fromDate = from ?? toDate.AddDays(-30);

            var rows = await repo.GetSalesByLocationAsync(effectiveChainId, fromDate, toDate);
            return format == "csv" ? Results.File(CsvExport.ToCsvBytes(rows), "text/csv", "sales-by-location.csv") : Results.Ok(rows);
        }).Produces<IReadOnlyList<SalesByLocationDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Confirmed-booking revenue grouped by location, for a date range (SuperAdmin/Admin/RootSuperAdmin only).");

        group.MapGet("/retention", async (int? locationId, DateOnly? from, DateOnly? to, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            var locId = locationId ?? currentUser.LocationId ?? 0;
            if (locId == 0) return Results.Ok(new RetentionDto(0, 0, 0m));

            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var toDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var fromDate = from ?? toDate.AddDays(-30);

            return Results.Ok(await repo.GetRetentionAsync(locId, fromDate, toDate));
        }).Produces<RetentionDto>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Share of a location's Confirmed-booking customers in a date range who were already returning customers.");

        group.MapGet("/no-show-rate", async (int? locationId, DateOnly? from, DateOnly? to, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            var locId = locationId ?? currentUser.LocationId ?? 0;
            if (locId == 0) return Results.Ok(new NoShowRateDto(0, 0, 0m));

            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var toDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var fromDate = from ?? toDate.AddDays(-30);

            return Results.Ok(await repo.GetNoShowRateAsync(locId, fromDate, toDate));
        }).Produces<NoShowRateDto>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("No-show rate among a location's appointments whose start time fell within a date range.");
    }
}
