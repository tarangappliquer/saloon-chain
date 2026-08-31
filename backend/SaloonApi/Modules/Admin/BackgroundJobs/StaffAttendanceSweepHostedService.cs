using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Email.TemplateModels;
using SaloonApi.Shared.ErrorHandling;

namespace SaloonApi.Modules.Admin.BackgroundJobs;

internal sealed class StaffAttendanceSweepHostedService(
    IServiceScopeFactory scopeFactory,
    IRedisConnectionProvider redisProvider,
    ILogger<StaffAttendanceSweepHostedService> logger,
    IDeveloperErrorNotifier errorNotifier) : BackgroundService
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
                await errorNotifier.NotifyAsync(ex, "StaffAttendanceSweepHostedService", ct: stoppingToken).ConfigureAwait(false);
            }
            catch (System.Data.Common.DbException ex)
            {
                logger.LogError(ex, "Database error occurred during StaffAttendanceSweepHostedService sweep.");
                await errorNotifier.NotifyAsync(ex, "StaffAttendanceSweepHostedService", ct: stoppingToken).ConfigureAwait(false);
            }
            // Top-level guard, same as the sibling sweep services: any other failure (Redis
            // unreachable, etc.) must not fault the BackgroundService and stop the whole host.
#pragma warning disable CA1031
            catch (Exception ex)
            {
                logger.LogError(ex, "StaffAttendanceSweepHostedService sweep failed.");
                await errorNotifier.NotifyAsync(ex, "StaffAttendanceSweepHostedService", ct: stoppingToken).ConfigureAwait(false);
            }
#pragma warning restore CA1031

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
        var bodyBuilder = scope.ServiceProvider.GetRequiredService<IEmailBodyBuilder>();

        var alerts = await repo.GetUnattendedPreBookingAlertsAsync();
        if (alerts.Count == 0) return;

        if (logger.IsEnabled(LogLevel.Information))
        {
            logger.LogInformation("Found {AlertCount} unattended pre-booking alerts starting within lead time window.", alerts.Count);
        }

        // Managers rarely change and several alerts often share a location (a busy location with
        // multiple unattended bookings at once) -- fetch each distinct location's managers once
        // per sweep tick instead of once per alert.
        var managersByLocation = new Dictionary<int, IReadOnlyList<LocationManagerDto>>();

        foreach (var alert in alerts)
        {
            if (!managersByLocation.TryGetValue(alert.LocationId, out var managers))
            {
                managers = await repo.GetLocationManagersAsync(alert.LocationId);
                managersByLocation[alert.LocationId] = managers;
            }

            foreach (var mgr in managers.Where(m => !string.IsNullOrWhiteSpace(m.Email)))
            {
                var model = new StaffUnattendedAlertModel
                {
                    ManagerName = mgr.Name,
                    AssignedStaffName = alert.AssignedStaffName,
                    AssignedStaffEmail = alert.AssignedStaffEmail,
                    BookingId = alert.BookingId,
                    TreatmentName = alert.TreatmentName,
                    LeadTimeMinutes = alert.LeadTimeMinutes,
                    StartTimeFormatted = alert.StartTime.ToString("t", System.Globalization.CultureInfo.InvariantCulture),
                    LocationName = alert.LocationName,
                    CustomerName = alert.CustomerName
                };

                var htmlBody = await bodyBuilder.BuildStaffUnattendedAlertAsync(model).ConfigureAwait(false);

                var email = new EmailMessage(
                    To: [new EmailAddress(mgr.Email, mgr.Name)],
                    Subject: $"[URGENT ALERT] Assigned Staff Not Arrived for Booking #{alert.BookingId}",
                    HtmlBody: htmlBody
                );
                emailQueue.Enqueue(email);
            }
        }
    }
}
