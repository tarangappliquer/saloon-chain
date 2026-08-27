using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace SaloonApi.Shared.Email;

internal sealed class SmtpEmailSender(IOptionsMonitor<EmailOptions> options) : IEmailSender
{
    private EmailOptions _options => options.CurrentValue;

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {

        if (!_options.Enable)
        {
            return;
        }

        using var mime = new MimeMessage();

        var from = message.From ?? new EmailAddress(_options.FromAddress, _options.FromName);
        mime.From.Add(ToMailbox(from));
        AddAll(mime.To, message.To);
        AddAll(mime.Cc, message.Cc);
        AddAll(mime.Bcc, message.Bcc);
        mime.Subject = message.Subject;

        var body = new BodyBuilder { HtmlBody = message.HtmlBody };
        foreach (var attachment in message.Attachments ?? [])
        {
            using var content = new MemoryStream(attachment.Content);
            await body.Attachments.AddAsync(attachment.FileName, content, ContentType.Parse(attachment.ContentType), ct);
        }
        mime.Body = body.ToMessageBody();

        using var client = new SmtpClient();
        var socketOptions = _options.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable;
        await client.ConnectAsync(_options.SmtpHost, _options.SmtpPort, socketOptions, ct);
        if (!string.IsNullOrEmpty(_options.Username))
            await client.AuthenticateAsync(_options.Username, _options.Password, ct);

        await client.SendAsync(mime, ct);
        await client.DisconnectAsync(true, ct);
    }

    private static void AddAll(InternetAddressList list, IReadOnlyList<EmailAddress>? addresses)
    {
        foreach (var address in addresses ?? [])
            list.Add(ToMailbox(address));
    }

    private static MailboxAddress ToMailbox(EmailAddress address) => new(address.Name ?? address.Email, address.Email);
}
