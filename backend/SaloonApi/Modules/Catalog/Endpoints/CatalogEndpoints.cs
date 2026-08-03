using SaloonApi.Modules.Catalog.Infrastructure;

namespace SaloonApi.Modules.Catalog.Endpoints;

internal static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/catalog").WithTags("Catalog");

        group.MapGet("/chains", async (CatalogRepository repo) =>
            Results.Ok(await repo.GetChainsAsync()))
            .Produces<IEnumerable<ChainDto>>()
            .WithDescription("List every active saloon chain.");

        group.MapGet("/locations", async (int chainId, CatalogRepository repo) =>
            Results.Ok(await repo.GetLocationsAsync(chainId)))
            .Produces<IEnumerable<LocationDto>>()
            .WithDescription("List the active locations belonging to a chain.");

        group.MapGet("/treatments", async (int locationId, int? categoryId, CatalogRepository repo) =>
            Results.Ok(await repo.GetTreatmentsAsync(locationId, categoryId)))
            .Produces<IEnumerable<TreatmentDto>>()
            .WithDescription("List the treatments a location offers, optionally filtered by category.");
    }
}
