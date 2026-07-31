namespace SaloonApi.Shared.Email;

internal interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}
