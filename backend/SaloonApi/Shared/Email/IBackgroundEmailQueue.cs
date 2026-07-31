namespace SaloonApi.Shared.Email;

internal interface IBackgroundEmailQueue
{
    // Synchronous, in-memory enqueue -- callers on a request path (e.g. booking confirmation) must
    // never block on actual SMTP I/O, so sending happens later on EmailQueueBackgroundService.
    void Enqueue(EmailMessage message);

    Task<EmailMessage> DequeueAsync(CancellationToken ct);
}
