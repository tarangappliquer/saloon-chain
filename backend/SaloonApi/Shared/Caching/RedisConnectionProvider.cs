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
    private readonly object _lock = new();
    private string? _currentConnectionString;
    private ConnectionMultiplexer? _multiplexer;
    private bool _disposed;

    public IConnectionMultiplexer? GetMultiplexer()
    {
        if (_disposed) return null;

        bool enabled = configuration.GetValue<bool?>("Redis:Enabled") ?? true;
        string? connStr = configuration["Redis:ConnectionString"] ?? configuration.GetConnectionString("Redis");

        if (!enabled || string.IsNullOrWhiteSpace(connStr) || connStr.Equals("none", StringComparison.OrdinalIgnoreCase))
        {
            lock (_lock)
            {
                if (_multiplexer is not null)
                {
                    logger.LogInformation("Redis disabled or connection string removed. Disposing existing multiplexer.");
                    _multiplexer.Dispose();
                    _multiplexer = null;
                    _currentConnectionString = null;
                }
            }
            return null;
        }

        lock (_lock)
        {
            if (_multiplexer is not null && _currentConnectionString == connStr)
            {
                return _multiplexer;
            }

            logger.LogInformation("Redis configuration active. Initializing/reconnecting multiplexer.");
            _multiplexer?.Dispose();
            _multiplexer = null;
            _currentConnectionString = connStr;

#pragma warning disable CA1031
            try
            {
                var options = ConfigurationOptions.Parse(connStr);
                options.AbortOnConnectFail = false;
                _multiplexer = ConnectionMultiplexer.Connect(options);
                return _multiplexer;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse/connect Redis configuration. Cache disabled.");
                return null;
            }
#pragma warning restore CA1031
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            if (_disposed) return;
            _disposed = true;
            _multiplexer?.Dispose();
            _multiplexer = null;
        }
    }
}
