using System.Collections.Concurrent;
using System.Threading.Channels;

namespace SaloonApi.Shared.Realtime;

// ponytail: in-process fan-out only (single instance). Scaling to multiple API instances needs a
// Redis pub/sub backplane instead of this dictionary — add when there's more than one instance.
internal sealed class SseBroadcaster
{
    private readonly ConcurrentDictionary<Guid, (string Group, Channel<string> Channel)> _subscribers = new();

    public (Guid Id, ChannelReader<string> Reader) Subscribe(string group)
    {
        var channel = Channel.CreateUnbounded<string>();
        var id = Guid.NewGuid();
        _subscribers[id] = (group, channel);
        return (id, channel.Reader);
    }

    public void Unsubscribe(Guid id)
    {
        if (_subscribers.TryRemove(id, out var sub))
            sub.Channel.Writer.TryComplete();
    }

    public void Publish(string group, string message)
    {
        foreach (var (_, sub) in _subscribers)
            if (sub.Group == group)
                sub.Channel.Writer.TryWrite(message);
    }

    public static string Group(int locationId, DateOnly date) => $"{locationId}:{date:yyyy-MM-dd}";
}
