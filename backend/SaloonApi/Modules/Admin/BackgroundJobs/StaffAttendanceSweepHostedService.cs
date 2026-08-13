using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Email;

namespace SaloonApi.Modules.Admin.BackgroundJobs;

internal sealed class StaffAttendanceSweepHostedService(
    IServiceScopeFactory scopeFactory,
    IRedisConnectionProvider redisProvider,
    ILogger<StaffAttendanceSweepHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Period = TimeSpan.FromMinutes(5);
    private const string LockKey = "lock:staff-attendance-sweep";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Period);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Locked: without it, every replica emails the same manager the same
                // "staff not arrived" alert on every tick.
                await RedisDistributedLock.TryRunAsync(redisProvider, LockKey, Period - TimeSpan.FromSeconds(30), SweepUnattendedBookingsAsync);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (InvalidOperationException ex)
            {
                logger.LogError(ex, "Invalid operation occurred during StaffAttendanceSweepHostedService sweep.");
            }
            catch (System.Data.Common.DbException ex)
            {
                logger.LogError(ex, "Database error occurred during StaffAttendanceSweepHostedService sweep.");
            }

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task SweepUnattendedBookingsAsync()
    {
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<UserRepository>();
        var emailQueue = scope.ServiceProvider.GetRequiredService<IBackgroundEmailQueue>();

        var alerts = await repo.GetUnattendedPreBookingAlertsAsync();
        if (alerts.Count == 0) return;

        if (logger.IsEnabled(LogLevel.Information))
        {
            logger.LogInformation("Found {AlertCount} unattended pre-booking alerts starting within lead time window.", alerts.Count);
        }

        foreach (var alert in alerts)
        {
            var managers = await repo.GetLocationManagersAsync(alert.LocationId);
            foreach (var mgr in managers.Where(m => !string.IsNullOrWhiteSpace(m.Email)))
            {
                var email = new EmailMessage(
                    To: [new EmailAddress(mgr.Email, mgr.Name)],
                    Subject: $"[URGENT ALERT] Assigned Staff Not Arrived for Booking #{alert.BookingId}",
                    HtmlBody: $"<p>Hello {mgr.Name},</p><p>Assigned staff member <strong>'{alert.AssignedStaffName}'</strong> has NOT logged arrival for today yet, and Booking #{alert.BookingId} for treatment <strong>'{alert.TreatmentName}'</strong> is starting in less than {alert.LeadTimeMinutes} minutes (at {alert.StartTime:t}) at {alert.LocationName}.</p><p><strong>Customer:</strong> {alert.CustomerName}<br/><strong>Assigned Staff:</strong> {alert.AssignedStaffName} ({alert.AssignedStaffEmail})</p><p><em>Please assign a proxy staff member immediately if the assigned staff is unavailable.</em></p>"
                );
                emailQueue.Enqueue(email);
            }
        }
    }
}
