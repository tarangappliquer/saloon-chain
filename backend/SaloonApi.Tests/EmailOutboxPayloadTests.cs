using System.Text.Json;
using SaloonApi.Shared.Email;
using Xunit;

namespace SaloonApi.Tests;

// The outbox stores each email as JSON in EmailOutbox.Payload (EmailOutboxQueue) and the dispatcher
// deserializes it back (EmailQueueBackgroundService). If EmailMessage's shape and EmailPayload.Json
// ever drift apart, every queued email silently fails to send -- so pin the round-trip.
public class EmailOutboxPayloadTests
{
    [Fact]
    public void RoundTripsAMinimalMessage()
    {
        var original = new EmailMessage(
            To: [new EmailAddress("customer@example.com", "Pat Customer")],
            Subject: "Your booking is confirmed",
            HtmlBody: "<p>See you Tuesday.</p>");

        var json = JsonSerializer.Serialize(original, EmailPayload.Json);
        var back = JsonSerializer.Deserialize<EmailMessage>(json, EmailPayload.Json);

        Assert.NotNull(back);
        Assert.Equal("Your booking is confirmed", back.Subject);
        Assert.Equal("<p>See you Tuesday.</p>", back.HtmlBody);
        Assert.Single(back.To);
        Assert.Equal("customer@example.com", back.To[0].Email);
        Assert.Equal("Pat Customer", back.To[0].Name);
        Assert.Null(back.From);
        Assert.Null(back.Cc);
    }

    [Fact]
    public void RoundTripsAllOptionalFields()
    {
        var original = new EmailMessage(
            To: [new EmailAddress("a@example.com")],
            Subject: "S",
            HtmlBody: "<b>b</b>",
            From: new EmailAddress("no-reply@saloonchains.local", "Saloon Chains"),
            Cc: [new EmailAddress("mgr@example.com")],
            Bcc: [new EmailAddress("audit@example.com")],
            Attachments: [new EmailAttachment("invoice.pdf", [1, 2, 3, 4], "application/pdf")]);

        var back = JsonSerializer.Deserialize<EmailMessage>(
            JsonSerializer.Serialize(original, EmailPayload.Json), EmailPayload.Json);

        Assert.NotNull(back);
        Assert.Equal("no-reply@saloonchains.local", back.From!.Email);
        Assert.Equal("mgr@example.com", back.Cc![0].Email);
        Assert.Equal("audit@example.com", back.Bcc![0].Email);
        Assert.Equal("invoice.pdf", back.Attachments![0].FileName);
        Assert.Equal(new byte[] { 1, 2, 3, 4 }, back.Attachments[0].Content);
        Assert.Equal("application/pdf", back.Attachments[0].ContentType);
    }
}
