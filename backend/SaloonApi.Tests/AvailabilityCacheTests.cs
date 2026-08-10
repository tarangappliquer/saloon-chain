using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using SaloonApi.Shared.Caching;
using StackExchange.Redis;
using Xunit;

namespace SaloonApi.Tests;

public class AvailabilityCacheTests
{
    [Fact]
    public async Task RedisAvailabilityCacheWhenMultiplexerNullActsAsNoOp()
    {
        var provider = Substitute.For<IRedisConnectionProvider>();
        provider.GetMultiplexer().Returns((IConnectionMultiplexer?)null);

        var logger = NullLogger<RedisAvailabilityCache>.Instance;
        var cache = new RedisAvailabilityCache(provider, logger);
        var date = new DateOnly(2026, 8, 6);

        var getResult = await cache.GetAsync(1, date, [10]);
        Assert.Null(getResult);

        var getDatesResult = await cache.GetDatesAsync(1, [10]);
        Assert.Null(getDatesResult);

        var setException = await Record.ExceptionAsync(() => cache.SetAsync(1, date, [10], "[]", TimeSpan.FromMinutes(5)));
        Assert.Null(setException);

        var setDatesException = await Record.ExceptionAsync(() => cache.SetDatesAsync(1, [10], "[]", TimeSpan.FromMinutes(5)));
        Assert.Null(setDatesException);

        var invalidateException = await Record.ExceptionAsync(() => cache.InvalidateAsync(1, date));
        Assert.Null(invalidateException);
    }

    [Fact]
    public async Task RedisAvailabilityCacheWhenRedisThrowsDegradesGracefully()
    {
        var redis = Substitute.For<IConnectionMultiplexer>();
        redis.GetDatabase(Arg.Any<int>(), Arg.Any<object>())
            .Throws(new InvalidOperationException("Redis is down"));

        var provider = Substitute.For<IRedisConnectionProvider>();
        provider.GetMultiplexer().Returns(redis);

        var logger = NullLogger<RedisAvailabilityCache>.Instance;
        var cache = new RedisAvailabilityCache(provider, logger);

        var date = new DateOnly(2026, 8, 6);

        var getResult = await cache.GetAsync(1, date, [10]);
        Assert.Null(getResult);

        var getDatesResult = await cache.GetDatesAsync(1, [10]);
        Assert.Null(getDatesResult);

        var setException = await Record.ExceptionAsync(() => cache.SetAsync(1, date, [10], "[]", TimeSpan.FromMinutes(5)));
        Assert.Null(setException);

        var setDatesException = await Record.ExceptionAsync(() => cache.SetDatesAsync(1, [10], "[]", TimeSpan.FromMinutes(5)));
        Assert.Null(setDatesException);

        var invalidateException = await Record.ExceptionAsync(() => cache.InvalidateAsync(1, date));
        Assert.Null(invalidateException);
    }

    [Fact]
    public void RedisConnectionProviderReturnsNullWhenUnconfiguredOrNone()
    {
        var inMemoryConfig = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Redis"] = "none"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(inMemoryConfig).Build();
        var logger = NullLogger<RedisConnectionProvider>.Instance;
        using var provider = new RedisConnectionProvider(config, logger);

        Assert.Null(provider.GetMultiplexer());
    }

    [Fact]
    public void RedisConnectionProviderReturnsNullWhenExplicitlyDisabled()
    {
        var inMemoryConfig = new Dictionary<string, string?>
        {
            ["Redis:Enabled"] = "false",
            ["Redis:ConnectionString"] = "localhost:6379"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(inMemoryConfig).Build();
        var logger = NullLogger<RedisConnectionProvider>.Instance;
        using var provider = new RedisConnectionProvider(config, logger);

        Assert.Null(provider.GetMultiplexer());
    }
}
