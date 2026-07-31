using SaloonApi.Modules.Booking.Application;

namespace SaloonApi.Modules.Booking.BackgroundJobs;

public sealed class HoldExpirySweepService(IServiceScopeFactory scopeFactory, ILogger<HoldExpirySweepService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var bookingService = scope.ServiceProvider.GetRequiredService<BookingService>();
                await bookingService.SweepExpiredHoldsAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Hold expiry sweep failed");
            }
        }
    }
}
