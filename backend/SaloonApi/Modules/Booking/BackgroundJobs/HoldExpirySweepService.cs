using SaloonApi.Modules.Booking.Application;
using SaloonApi.Shared.Caching;

namespace SaloonApi.Modules.Booking.BackgroundJobs;

internal sealed class HoldExpirySweepService(
    IServiceScopeFactory scopeFactory,
    IRedisConnectionProvider redisProvider,
    ILogger<HoldExpirySweepService> logger) : BackgroundService
{
    private const string LockKey = "lock:hold-expiry-sweep";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await RedisDistributedLock.TryRunAsync(redisProvider, LockKey, TimeSpan.FromSeconds(25), async () =>
                {
                    using var scope = scopeFactory.CreateScope();
                    var bookingService = scope.ServiceProvider.GetRequiredService<BookingService>();
                    await bookingService.SweepExpiredHoldsAsync();
                });
            }
            // CA1031: this is the sweep loop's top-level guard -- any single failure (SQL, Redis,
            // anything) must not kill the BackgroundService; log and try again next tick.
#pragma warning disable CA1031
            catch (Exception ex)
            {
                logger.LogError(ex, "Hold expiry sweep failed");
            }
#pragma warning restore CA1031
        }
    }
}
