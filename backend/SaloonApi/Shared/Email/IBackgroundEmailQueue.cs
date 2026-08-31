namespace SaloonApi.Shared.Email;

internal interface IBackgroundEmailQueue
{
    // Persists the email to the public.EmailOutbox table in the caller's flow; EmailQueueBackgroundService
    // polls the table, sends over SMTP, and marks each row. Survives process restarts and SMTP outages
    // (the old in-memory Channel implementation dropped everything on a crash). Callers on a request path
    // still return without waiting on SMTP -- only a fast INSERT happens inline.
    //
    // NOT used for developer error alerts -- those send inline via IDeveloperErrorNotifier so they still
    // work when the database itself is the thing that is broken.
    Task EnqueueAsync(EmailMessage message, CancellationToken ct = default);
}
