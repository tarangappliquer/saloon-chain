namespace SaloonApi.Shared.Email;

internal sealed class EmailOptions
{
    public string SmtpHost { get; init; } = "localhost";
    public int SmtpPort { get; init; } = 1025; // local dev catcher (e.g. MailHog/smtp4dev) default
    public string Username { get; init; } = "";
    public string Password { get; init; } = "";
    public bool UseSsl { get; init; }
    public string FromAddress { get; init; } = "no-reply@saloonchains.local";
    public string FromName { get; init; } = "Saloon Chains";
    public string DeveloperEmail { get; init; } = "tarangkalaria55@gmail.com";
}
