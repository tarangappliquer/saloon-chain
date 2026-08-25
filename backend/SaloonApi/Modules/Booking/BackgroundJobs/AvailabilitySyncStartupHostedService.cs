using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Shared.Caching;

namespace SaloonApi.Modules.Booking.BackgroundJobs;

internal sealed class AvailabilitySyncStartupHostedService(
    IServiceScopeFactory scopeFactory,
    IRedisConnectionProvider redisProvider,
    ILogger<AvailabilitySyncStartupHostedService> logger) : BackgroundService
{
    private const string LockKey = "lock:availability-startup-sync";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Short pause to allow initial web server binding to complete
        await Task.Delay(1000, stoppingToken);

        try
        {
            // Locked: without it, every replica re-runs the same full venue scan/write on boot.
            bool ran = await RedisDistributedLock.TryRunAsync(redisProvider, LockKey, TimeSpan.FromMinutes(2), async () =>
            {
                logger.LogInformation("Starting initial Redis availability pre-sync for all locations...");
                using var scope = scopeFactory.CreateScope();
                var catalog = scope.ServiceProvider.GetRequiredService<CatalogRepository>();

                var venues = await catalog.SearchVenuesAsync(null);
                var today = DateOnly.FromDateTime(DateTime.Now);

                // Bounded concurrency across venues (each own scope, so each gets its own DB
                // connections rather than sharing one BookingService instance). SyncAndNotifyAsync's
                // fire-and-forget Task.Run isn't used here: awaiting it doesn't actually wait for the
                // warm-up (the outer foreach used to race through every venue near-instantly, firing
                // one untracked background task per venue -- an unthrottled stampede at every boot).
                // WarmAvailabilityAsync is awaited directly so this loop's concurrency cap is real.
                await Parallel.ForEachAsync(venues, new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = stoppingToken },
                    async (venue, _) =>
                    {
#pragma warning disable CA1873
                        logger.LogInformation("Pre-syncing Redis availability for location {LocationId} ({LocationName})...", venue.Id, venue.Name);
#pragma warning restore CA1873
                        using var venueScope = scopeFactory.CreateScope();
                        var venueBookingSvc = venueScope.ServiceProvider.GetRequiredService<BookingService>();
                        await venueBookingSvc.WarmAvailabilityAsync(venue.Id, today);
                    });
                logger.LogInformation("Redis availability pre-sync completed successfully.");
            });

            if (!ran)
            {
                logger.LogInformation("Skipping Redis availability pre-sync: another replica already holds the startup lock.");
            }
        }
#pragma warning disable CA1031
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis availability startup pre-sync encountered an issue; falling back to dynamic caching.");
        }
#pragma warning restore CA1031
    }
}
