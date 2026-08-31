using System.Text.Json;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Shared.Email;

internal static class EmailPayload
{
    // Shared by the enqueue (serialize) and dispatch (deserialize) sides so the round-trip stays symmetric.
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
}

// Outbox producer: writes the email as one row in public.EmailOutbox. The actual SMTP send happens
// later in EmailQueueBackgroundService.
internal sealed class EmailOutboxQueue(SqlConnectionFactory factory, EmailOutboxDbService outboxDb) : IBackgroundEmailQueue
{
    public async Task EnqueueAsync(EmailMessage message, CancellationToken ct = default)
    {
        var payload = JsonSerializer.Serialize(message, EmailPayload.Json);
        using var db = factory.Create();
        await outboxDb.sp_EmailOutbox_EnqueueAsync(db, payload, message.Subject);
    }
}
