using SaloonApi.Shared.ErrorHandling;

namespace SaloonApi.Shared.Email;

internal sealed class EmailQueueBackgroundService(
    IBackgroundEmailQueue queue,
    IEmailSender sender,
    ILogger<EmailQueueBackgroundService> logger,
    IDeveloperErrorNotifier errorNotifier) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var message = await queue.DequeueAsync(stoppingToken);
            try
            {
                await sender.SendAsync(message, stoppingToken);
            }
            // CA1031: top-level guard for the queue-drain loop -- an SMTP failure for one email
            // (bad address, server down, timeout) must not crash the service or block the next
            // queued email; log and move on.
#pragma warning disable CA1031
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to send email to {ToEmails}", string.Join(", ", message.To.Select(a => a.Email)));
                if (message.Subject is null || !message.Subject.Contains("[SaloonApi Alert]", StringComparison.OrdinalIgnoreCase))
                {
                    await errorNotifier.NotifyAsync(ex, "EmailQueueBackgroundService", ct: stoppingToken).ConfigureAwait(false);
                }
            }
#pragma warning restore CA1031
        }
    }
}
