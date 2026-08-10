using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;

namespace SaloonApi.Modules.Catalog.Endpoints;

internal static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/catalog").WithTags("Catalog");

        group.MapGet("/chains", async (ICurrentUser currentUser, UserRepository userRepo, CatalogRepository repo) =>
        {
            var chains = await repo.GetChainsAsync();
            if (currentUser.EmulatedByUserId is { } emulatorId)
            {
                var emulator = await userRepo.GetByIdAsync(emulatorId);
                if (emulator is not null && (emulator.Role == UserRole.SuperAdmin || emulator.Role == UserRole.Admin) && emulator.ChainId is not null)
                {
                    chains = chains.Where(c => c.Id == emulator.ChainId.Value).ToList();
                }
            }
            return Results.Ok(chains);
        }).Produces<IEnumerable<ChainDto>>()
          .WithDescription("List active saloon chains (filtered to the staff member's chain during emulation).");

        group.MapGet("/locations", async (int chainId, ICurrentUser currentUser, UserRepository userRepo, CatalogRepository repo) =>
        {
            var locations = await repo.GetLocationsAsync(chainId);
            if (currentUser.EmulatedByUserId is { } emulatorId)
            {
                var emulator = await userRepo.GetByIdAsync(emulatorId);
                if (emulator is not null && (emulator.Role == UserRole.SuperAdmin || emulator.Role == UserRole.Admin))
                {
                    if (emulator.ChainId is not null)
                        locations = locations.Where(l => l.ChainId == emulator.ChainId.Value).ToList();
                    if (emulator.LocationId is not null)
                        locations = locations.Where(l => l.Id == emulator.LocationId.Value).ToList();
                }
            }
            return Results.Ok(locations);
        }).Produces<IEnumerable<LocationDto>>()
          .WithDescription("List active locations for a chain (filtered during emulation).");

        group.MapGet("/treatments", async (int locationId, int? categoryId, CatalogRepository repo) =>
            Results.Ok(await repo.GetTreatmentsAsync(locationId, categoryId)))
            .Produces<IEnumerable<TreatmentDto>>()
            .WithDescription("List the treatments a location offers, optionally filtered by category.");

        group.MapGet("/treatments/{id:int}/prices", async (int id, CatalogRepository repo) =>
            Results.Ok(await repo.GetTreatmentPricesAsync(id)))
            .Produces<IEnumerable<TreatmentPriceDto>>()
            .WithDescription("List a treatment's full price history (past and scheduled future), newest effective date first.");

        group.MapGet("/treatments/{id:int}/durations", async (int id, CatalogRepository repo) =>
            Results.Ok(await repo.GetTreatmentDurationsAsync(id)))
            .Produces<IEnumerable<TreatmentDurationDto>>()
            .WithDescription("List a treatment's full duration history (past and scheduled future), newest effective date first.");

        group.MapGet("/search", async (string? q, CatalogRepository repo) =>
            Results.Ok(await repo.SearchVenuesAsync(q)))
            .Produces<IEnumerable<VenueSearchResultDto>>()
            .WithDescription("Search saloons, locations, treatments, and categories.");
    }
}
