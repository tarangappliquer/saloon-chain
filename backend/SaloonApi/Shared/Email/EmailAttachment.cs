namespace SaloonApi.Shared.Email;

// ContentType is a plain MIME type string (e.g. "application/pdf") -- parsed by SmtpEmailSender
// via MimeKit's ContentType.Parse, kept as a string here so this type carries no MimeKit
// dependency for callers that just want to attach a file.
internal sealed record EmailAttachment(string FileName, byte[] Content, string ContentType);
