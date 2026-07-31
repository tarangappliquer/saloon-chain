namespace SaloonApi.Shared.Email;

// From/Cc/Bcc/Attachments are optional -- From falls back to EmailOptions' configured
// FromAddress/FromName in SmtpEmailSender when null, and Cc/Bcc/Attachments default to empty so
// call sites that only need To/Subject/HtmlBody (e.g. BookingService's confirmation email) stay
// simple.
internal sealed record EmailMessage(
    IReadOnlyList<EmailAddress> To,
    string Subject,
    string HtmlBody,
    EmailAddress? From = null,
    IReadOnlyList<EmailAddress>? Cc = null,
    IReadOnlyList<EmailAddress>? Bcc = null,
    IReadOnlyList<EmailAttachment>? Attachments = null);
