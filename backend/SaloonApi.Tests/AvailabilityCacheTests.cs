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
    public async Task NullAvailabilityCacheGetAsyncReturnsNull()
    {
        var cache = new NullAvailabilityCache();
        var result = await cache.GetAsync(1, new DateOnly(2026, 8, 6), [10, 20]);
        Assert.Null(result);
    }

    [Fact]
    public async Task NullAvailabilityCacheSetAsyncCompletesWithoutError()
    {
        var cache = new NullAvailabilityCache();
        var exception = await Record.ExceptionAsync(() => cache.SetAsync(1, new DateOnly(2026, 8, 6), [10, 20], "[]", TimeSpan.FromMinutes(5)));
        Assert.Null(exception);
    }

    [Fact]
    public async Task NullAvailabilityCacheInvalidateAsyncCompletesWithoutError()
    {
        var cache = new NullAvailabilityCache();
        var exception = await Record.ExceptionAsync(() => cache.InvalidateAsync(1, new DateOnly(2026, 8, 6)));
        Assert.Null(exception);
    }

    [Fact]
    public async Task RedisAvailabilityCacheWhenRedisThrowsDegradesGracefully()
    {
        var redis = Substitute.For<IConnectionMultiplexer>();
        redis.GetDatabase(Arg.Any<int>(), Arg.Any<object>())
            .Throws(new InvalidOperationException("Redis is down"));

        var logger = NullLogger<RedisAvailabilityCache>.Instance;
        var cache = new RedisAvailabilityCache(redis, logger);

        var date = new DateOnly(2026, 8, 6);

        // GetAsync should catch exception and return null
        var getResult = await cache.GetAsync(1, date, [10]);
        Assert.Null(getResult);

        // SetAsync should catch exception without throwing
        var setException = await Record.ExceptionAsync(() => cache.SetAsync(1, date, [10], "[]", TimeSpan.FromMinutes(5)));
        Assert.Null(setException);

        // InvalidateAsync should catch exception without throwing
        var invalidateException = await Record.ExceptionAsync(() => cache.InvalidateAsync(1, date));
        Assert.Null(invalidateException);
    }
}
