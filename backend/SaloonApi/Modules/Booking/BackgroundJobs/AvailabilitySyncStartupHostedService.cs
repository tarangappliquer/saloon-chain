using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Catalog.Infrastructure;

namespace SaloonApi.Modules.Booking.BackgroundJobs;

internal sealed class AvailabilitySyncStartupHostedService(IServiceScopeFactory scopeFactory, ILogger<AvailabilitySyncStartupHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Short pause to allow initial web server binding to complete
        await Task.Delay(1000, stoppingToken);

        try
        {
            logger.LogInformation("Starting initial Redis availability pre-sync for all locations...");
            using var scope = scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<CatalogRepository>();
            var bookingSvc = scope.ServiceProvider.GetRequiredService<BookingService>();

            var venues = await catalog.SearchVenuesAsync(null);
            var today = DateOnly.FromDateTime(DateTime.Now);

            foreach (var venue in venues)
            {
                if (stoppingToken.IsCancellationRequested) break;

#pragma warning disable CA1873
                logger.LogInformation("Pre-syncing Redis availability for location {LocationId} ({LocationName})...", venue.Id, venue.Name);
#pragma warning restore CA1873
                await bookingSvc.SyncAndNotifyAsync(venue.Id, today);
            }
            logger.LogInformation("Redis availability pre-sync completed successfully.");
        }
#pragma warning disable CA1031
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis availability startup pre-sync encountered an issue; falling back to dynamic caching.");
        }
#pragma warning restore CA1031
    }
}
