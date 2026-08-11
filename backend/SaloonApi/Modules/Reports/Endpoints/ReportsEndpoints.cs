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

        group.MapGet("/sales-by-service", async (int locationId, DateOnly from, DateOnly to, string? format, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var rows = await repo.GetSalesByServiceAsync(locationId, from, to);
            return format == "csv" ? Results.File(CsvExport.ToCsvBytes(rows), "text/csv", "sales-by-service.csv") : Results.Ok(rows);
        }).Produces<IReadOnlyList<SalesByServiceDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Confirmed-booking revenue grouped by treatment, for a date range.");

        group.MapGet("/sales-by-staff", async (int locationId, DateOnly from, DateOnly to, string? format, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            var rows = await repo.GetSalesByStaffAsync(locationId, from, to);
            return format == "csv" ? Results.File(CsvExport.ToCsvBytes(rows), "text/csv", "sales-by-staff.csv") : Results.Ok(rows);
        }).Produces<IReadOnlyList<SalesByStaffDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Confirmed-booking revenue grouped by therapist, for a date range.");

        group.MapGet("/sales-by-location", async (int chainId, DateOnly from, DateOnly to, string? format, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) && currentUser.ChainId != chainId)
                return Results.Problem("Not authorized for this chain.", statusCode: StatusCodes.Status403Forbidden);
            if (currentUser.IsInRole(UserRole.Manager))
                return Results.Problem("Chain-wide rollup is not available to Manager.", statusCode: StatusCodes.Status403Forbidden);

            var rows = await repo.GetSalesByLocationAsync(chainId, from, to);
            return format == "csv" ? Results.File(CsvExport.ToCsvBytes(rows), "text/csv", "sales-by-location.csv") : Results.Ok(rows);
        }).Produces<IReadOnlyList<SalesByLocationDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Confirmed-booking revenue grouped by location, for a date range (SuperAdmin/Admin/RootSuperAdmin only).");

        group.MapGet("/retention", async (int locationId, DateOnly from, DateOnly to, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetRetentionAsync(locationId, from, to));
        }).Produces<RetentionDto>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Share of a location's Confirmed-booking customers in a date range who were already returning customers.");

        group.MapGet("/no-show-rate", async (int locationId, DateOnly from, DateOnly to, ICurrentUser currentUser, ReportsRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetNoShowRateAsync(locationId, from, to));
        }).Produces<NoShowRateDto>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("No-show rate among a location's appointments whose start time fell within a date range.");
    }
}
