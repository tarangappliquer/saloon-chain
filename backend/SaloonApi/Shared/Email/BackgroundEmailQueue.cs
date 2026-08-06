using System.Threading.Channels;

namespace SaloonApi.Shared.Email;

internal sealed class BackgroundEmailQueue : IBackgroundEmailQueue
{
    private readonly Channel<EmailMessage> _channel = Channel.CreateBounded<EmailMessage>(new BoundedChannelOptions(1000)
    {
        FullMode = BoundedChannelFullMode.DropOldest,
        SingleWriter = false,
        SingleReader = false
    });

    public void Enqueue(EmailMessage message) => _channel.Writer.TryWrite(message);

    public async Task<EmailMessage> DequeueAsync(CancellationToken ct) => await _channel.Reader.ReadAsync(ct);
}
