using System.Threading.Channels;

namespace SaloonApi.Shared.Email;

// Unbounded: email volume here is one per booking confirmation, nowhere near enough to need
// backpressure -- an unbounded channel keeps Enqueue non-blocking, which matters since it's called
// from the booking-confirm request path.
internal sealed class BackgroundEmailQueue : IBackgroundEmailQueue
{
    private readonly Channel<EmailMessage> _channel = Channel.CreateUnbounded<EmailMessage>();

    public void Enqueue(EmailMessage message) => _channel.Writer.TryWrite(message);

    public async Task<EmailMessage> DequeueAsync(CancellationToken ct) => await _channel.Reader.ReadAsync(ct);
}
