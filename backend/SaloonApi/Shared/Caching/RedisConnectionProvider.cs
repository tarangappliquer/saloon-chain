using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace SaloonApi.Shared.Caching;

internal interface IRedisConnectionProvider
{
    IConnectionMultiplexer? GetMultiplexer();
}

#pragma warning disable CA1859, CA1873
internal sealed class RedisConnectionProvider(IConfiguration configuration, ILogger<RedisConnectionProvider> logger) : IRedisConnectionProvider, IDisposable
{
    // volatile: the happy path (multiplexer already built) is a lock-free read. This matters --
    // GetMultiplexer() is called from every request that touches the availability cache, from the
    // SSE hot path, and from three background sweeps. The previous version took a lock on EVERY
    // call, and the slow path held that same lock across the *synchronous* ConnectionMultiplexer
    // .Connect(), so a single unreachable-Redis blip serialized the entire thread pool behind one
    // 5s connect attempt -- the whole API would hang, and even unrelated Postgres DNS lookups
    // started failing with EAGAIN once the pool was starved.
    private volatile IConnectionMultiplexer? _multiplexer;
    // 0 = idle, 1 = a thread is inside Connect(). Single-flight gate, checked via Interlocked so
    // no lock is ever held while Connect() blocks.
    private int _connecting;
    private volatile bool _disposed;

    public IConnectionMultiplexer? GetMultiplexer()
    {
        if (_disposed) return null;

        var existing = _multiplexer;
        if (existing is not null) return existing;

        bool enabled = configuration.GetValue<bool?>("Redis:Enabled") ?? true;
        string? connStr = configuration["Redis:ConnectionString"] ?? configuration.GetConnectionString("Redis");
        if (!enabled || string.IsNullOrWhiteSpace(connStr) || connStr.Equals("none", StringComparison.OrdinalIgnoreCase))
            return null;

        // Only one thread ever attempts the blocking connect. Everyone else gets null *now* and
        // degrades gracefully (cache miss / local-only SSE / sweep skipped) until it is ready.
        if (Interlocked.CompareExchange(ref _connecting, 1, 0) != 0)
            return null;

#pragma warning disable CA1031
        try
        {
            var options = ConfigurationOptions.Parse(connStr);
            options.AbortOnConnectFail = false;   // return a multiplexer that self-heals rather than throwing
            options.ConnectTimeout = 2000;        // fail fast; the retry happens in the background
            options.ConnectRetry = 3;
            var mux = ConnectionMultiplexer.Connect(options);
            _multiplexer = mux;
            logger.LogInformation("Redis multiplexer connected.");
            return mux;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to connect Redis. Cache/backplane disabled until next attempt.");
            return null;
        }
        finally
        {
            Interlocked.Exchange(ref _connecting, 0);
        }
#pragma warning restore CA1031
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _multiplexer?.Dispose();
        _multiplexer = null;
    }
}
