using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using System.Threading.Channels;
using SaloonApi.Shared.Caching;
using StackExchange.Redis;

namespace SaloonApi.Shared.Realtime;

internal sealed class SseBroadcaster
{
    private static readonly RedisChannel SseChannel = RedisChannel.Literal("saloon:sse:events");
    private readonly string _podInstanceId = Guid.NewGuid().ToString("N");
    private readonly ConcurrentDictionary<Guid, (string Group, Channel<string> Channel)> _subscribers = new();
    private readonly IRedisConnectionProvider _redisProvider;
    private readonly ILogger<SseBroadcaster> _logger;

    // The multiplexer instance we currently hold a subscription on. RedisConnectionProvider hands
    // back a brand-new multiplexer if Redis was down at startup, so re-subscribe when it changes.
    private readonly object _subGate = new();
    private IConnectionMultiplexer? _subscribedOn;

    public SseBroadcaster(IRedisConnectionProvider redisProvider, ILogger<SseBroadcaster> logger)
    {
        _redisProvider = redisProvider;
        _logger = logger;
        TryAttachSubscription(_redisProvider.GetMultiplexer());
    }

    // Attaches the pub/sub handler to a multiplexer, once per instance. _subGate is held only for a
    // reference compare-and-set (nanoseconds, never across I/O); the actual SubscribeAsync is fire-
    // and-forget outside the lock, so this is safe to call from the Publish hot path.
    // StackExchange.Redis re-establishes the subscription itself across reconnects of the SAME
    // multiplexer -- this only re-runs if RedisConnectionProvider swaps in a different instance.
    private void TryAttachSubscription(IConnectionMultiplexer? mux)
    {
        if (mux is null)
            return;

        lock (_subGate)
        {
            if (ReferenceEquals(_subscribedOn, mux))
                return;
            _subscribedOn = mux;
        }

        _ = SubscribeSafeAsync(mux);
    }

    private async Task SubscribeSafeAsync(IConnectionMultiplexer mux)
    {
#pragma warning disable CA1031
        try
        {
            await mux.GetSubscriber().SubscribeAsync(SseChannel, OnRedisMessage).ConfigureAwait(false);
            _logger.LogInformation("SSE Redis PubSub backplane subscribed.");
        }
        catch (Exception ex)
        {
            // Let a later Publish retry against this (or a newer) multiplexer.
            lock (_subGate)
            {
                if (ReferenceEquals(_subscribedOn, mux))
                    _subscribedOn = null;
            }
            _logger.LogWarning(ex, "Failed to subscribe SSE Redis backplane; using local broadcast only.");
        }
#pragma warning restore CA1031
    }

    private void OnRedisMessage(RedisChannel _, RedisValue value)
    {
        if (value.IsNullOrEmpty) return;
#pragma warning disable CA1031
        try
        {
            var payload = JsonSerializer.Deserialize<SseMessagePayload>(value.ToString());
            if (payload is null || payload.OriginPod == _podInstanceId) return;

            DispatchLocal(payload.TargetGroup, payload.Content);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to process Redis SSE message");
        }
#pragma warning restore CA1031
    }

    public (Guid Id, ChannelReader<string> Reader) Subscribe(string group)
    {
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(100)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleWriter = false,
            SingleReader = true
        });
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
        Publish(Group(locationId, date), message);
    }

    public void Publish(string group, string message)
    {
        // 1. Dispatch to local subscribers on this node
        DispatchLocal(group, message);

        // 2. Publish to Redis channel for multi-node Kubernetes fanout
#pragma warning disable CA1031
        try
        {
            var mux = _redisProvider.GetMultiplexer();
            TryAttachSubscription(mux);
            if (mux is not null && mux.IsConnected)
            {
                var payload = JsonSerializer.Serialize(new SseMessagePayload(_podInstanceId, group, message));
                mux.GetSubscriber().Publish(SseChannel, payload, CommandFlags.FireAndForget);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to publish SSE event to Redis backplane");
        }
#pragma warning restore CA1031
    }

    private void DispatchLocal(string group, string message)
    {
        var parts = group.Split(':');
        if (parts.Length == 2 && int.TryParse(parts[0], CultureInfo.InvariantCulture, out var locationId))
        {
            var locPrefix = $"{locationId}:";
            var locGroup = LocationGroup(locationId);
            foreach (var (_, sub) in _subscribers)
            {
                if (sub.Group == locGroup || sub.Group.StartsWith(locPrefix, StringComparison.Ordinal))
                    sub.Channel.Writer.TryWrite(message);
            }
            return;
        }

        foreach (var (_, sub) in _subscribers)
        {
            if (sub.Group == group)
                sub.Channel.Writer.TryWrite(message);
        }
    }

    public static string Group(int locationId, DateOnly date) => $"{locationId}:{date:yyyy-MM-dd}";
    public static string LocationGroup(int locationId) => $"{locationId}";

    // "user:" prefix (not a bare int) is deliberate -- DispatchLocal's location-group fast path
    // treats any "<int>:<suffix>" group as a location broadcast, and userId is itself an int.
    public static string UserGroup(int userId) => $"user:{userId}";

    private sealed record SseMessagePayload(string OriginPod, string TargetGroup, string Content);
}
