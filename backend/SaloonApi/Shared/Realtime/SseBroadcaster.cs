using System.Collections.Concurrent;
using System.Globalization;
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

    public void Publish(int locationId, DateOnly date, string message)
    {
        var locPrefix = $"{locationId}:";
        var locGroup = LocationGroup(locationId);
        foreach (var (_, sub) in _subscribers)
        {
            if (sub.Group == locGroup || sub.Group.StartsWith(locPrefix, StringComparison.Ordinal))
                sub.Channel.Writer.TryWrite(message);
        }
    }

    public void Publish(string group, string message)
    {
        var parts = group.Split(':');
        if (parts.Length == 2 && int.TryParse(parts[0], CultureInfo.InvariantCulture, out var locationId) && DateOnly.TryParse(parts[1], CultureInfo.InvariantCulture, out var date))
        {
            Publish(locationId, date, message);
            return;
        }

        foreach (var (_, sub) in _subscribers)
            if (sub.Group == group)
                sub.Channel.Writer.TryWrite(message);
    }

    public static string Group(int locationId, DateOnly date) => $"{locationId}:{date:yyyy-MM-dd}";
    public static string LocationGroup(int locationId) => $"{locationId}";
}
