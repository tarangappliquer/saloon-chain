namespace SaloonApi.Shared.Email;

internal sealed class EmailOptions
{
    public bool Enable { get; init; }
    public string SmtpHost { get; init; } = "localhost";
    public int SmtpPort { get; init; } = 1025; // local dev catcher (e.g. MailHog/smtp4dev) default
    public string Username { get; init; } = "";
    public string Password { get; init; } = "";
    public bool UseSsl { get; init; }
    public string FromAddress { get; init; } = "no-reply@saloonchains.local";
    public string FromName { get; init; } = "Saloon Chains";
    public string DeveloperEmail { get; init; } = "tarangkalaria55@gmail.com";

    // --- Outbox dispatcher (EmailQueueBackgroundService) ---
    public int OutboxPollSeconds { get; init; } = 10;   // how often to scan for due rows
    public int OutboxBatchSize { get; init; } = 20;     // rows claimed per poll
    public int OutboxMaxAttempts { get; init; } = 5;    // after this many failed sends, row -> 'Failed'
}
