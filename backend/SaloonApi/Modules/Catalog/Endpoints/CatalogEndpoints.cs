using SaloonApi.Modules.Catalog.Infrastructure;

namespace SaloonApi.Modules.Catalog.Endpoints;

public static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/catalog");

        group.MapGet("/chains", async (CatalogRepository repo) =>
            Results.Ok(await repo.GetChainsAsync()));

        group.MapGet("/locations", async (int chainId, CatalogRepository repo) =>
            Results.Ok(await repo.GetLocationsAsync(chainId)));

        group.MapGet("/treatments", async (int locationId, int? categoryId, CatalogRepository repo) =>
            Results.Ok(await repo.GetTreatmentsAsync(locationId, categoryId)));
    }
}
