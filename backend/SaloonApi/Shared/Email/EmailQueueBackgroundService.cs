using System.Text.Json;
using Microsoft.Extensions.Options;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;
using SaloonApi.Shared.ErrorHandling;

namespace SaloonApi.Shared.Email;

// Outbox consumer. Polls public.EmailOutbox for due rows, sends them over SMTP, and marks each
// row Sent or (after EmailOptions.OutboxMaxAttempts failures) Failed. fn_EmailOutbox_Claim uses
// FOR UPDATE SKIP LOCKED, so running multiple API nodes just splits the work -- no coordination.
internal sealed class EmailQueueBackgroundService(
    SqlConnectionFactory factory,
    EmailOutboxDbService outboxDb,
    IEmailSender sender,
    IOptionsMonitor<EmailOptions> options,
    ILogger<EmailQueueBackgroundService> logger,
    IDeveloperErrorNotifier errorNotifier) : BackgroundService
{
    // ponytail: internals, not ops knobs (unlike Poll/Batch/MaxAttempts in EmailOptions). A claimed
    // row is hidden for VisibilitySeconds -- if this process dies mid-send the row just retries
    // after that, having spent one attempt. Failed sends back off linearly: BackoffBaseSeconds * attempts.
    private const int VisibilitySeconds = 120;
    private const int BackoffBaseSeconds = 60;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var pollSeconds = Math.Max(1, options.CurrentValue.OutboxPollSeconds);
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(pollSeconds));
        do
        {
            try
            {
                await DispatchDueAsync(stoppingToken);
            }
            // CA1031: top-level guard for the poll loop -- a DB blip or bad batch must not fault the
            // BackgroundService (default HostOptions behaviour would stop the whole host); log and
            // try again next tick.
#pragma warning disable CA1031
            catch (Exception ex)
            {
                logger.LogError(ex, "Email outbox dispatch failed");
                await errorNotifier.NotifyAsync(ex, "EmailQueueBackgroundService", ct: stoppingToken).ConfigureAwait(false);
            }
#pragma warning restore CA1031
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task DispatchDueAsync(CancellationToken ct)
    {
        var opt = options.CurrentValue;

        List<EmailOutboxClaimRow> batch;
        using (var db = factory.Create())
            batch = (await outboxDb.fn_EmailOutbox_ClaimAsync(db, opt.OutboxBatchSize, VisibilitySeconds)).ToList();

        foreach (var row in batch)
        {
            ct.ThrowIfCancellationRequested();

            EmailMessage? message;
            try
            {
                message = JsonSerializer.Deserialize<EmailMessage>(row.Payload, EmailPayload.Json);
            }
#pragma warning disable CA1031
            catch (Exception ex)
            {
                // A payload that will not parse can never succeed -- fail it permanently (maxAttempts 0).
                await MarkFailedAsync(row.Id, "Payload deserialize failed: " + ex.Message, 0);
                continue;
            }
#pragma warning restore CA1031

            if (message is null)
            {
                await MarkFailedAsync(row.Id, "Payload deserialized to null", 0);
                continue;
            }

            try
            {
                await sender.SendAsync(message, ct);
                using var db = factory.Create();
                await outboxDb.sp_EmailOutbox_MarkSentAsync(db, row.Id);
            }
#pragma warning disable CA1031
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Email outbox row {Id} send failed (attempt tracked in DB)", row.Id);
                await MarkFailedAsync(row.Id, ex.ToString(), opt.OutboxMaxAttempts);
            }
#pragma warning restore CA1031
        }
    }

    private async Task MarkFailedAsync(long id, string error, int maxAttempts)
    {
        using var db = factory.Create();
        await outboxDb.sp_EmailOutbox_MarkFailedAsync(db, id, error, maxAttempts, BackoffBaseSeconds);
    }
}
