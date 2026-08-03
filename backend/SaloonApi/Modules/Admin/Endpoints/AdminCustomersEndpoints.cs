using SaloonApi.Modules.Identity.Infrastructure;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminCustomersEndpoints
{
    public static void MapAdminCustomersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/customers").RequireAuthorization("AdminAccess").WithTags("Admin Customers")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        // Backs the adminportal's emulation picker -- search only (no "list everyone" use case),
        // same AdminAccess gate as the emulate exchange itself in AuthEndpoints.
        group.MapGet("/search", async (string q, UserRepository repo) =>
            Results.Ok(await repo.SearchCustomersAsync(q)))
            .Produces<IReadOnlyList<CustomerSummaryDto>>()
            .WithDescription("Search customers by name/email for the emulation picker.");
    }
}
