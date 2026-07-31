using StackExchange.Redis;

namespace SaloonApi.Shared.Caching;

// Cache-aside only: the SP under sp_getapplock is the correctness boundary, this just saves a
// round-trip to SQL Server for repeated availability reads. Invalidated on every write.
public sealed class RedisAvailabilityCache(IConnectionMultiplexer redis) : IAvailabilityCache
{
    private static string Key(int locationId, DateOnly date) => $"avail:{locationId}:{date:yyyy-MM-dd}";

    public async Task<string?> GetAsync(int locationId, DateOnly date)
    {
        var value = await redis.GetDatabase().StringGetAsync(Key(locationId, date));
        return value.IsNullOrEmpty ? null : value.ToString();
    }

    public Task SetAsync(int locationId, DateOnly date, string json, TimeSpan ttl) =>
        redis.GetDatabase().StringSetAsync(Key(locationId, date), json, ttl);

    public Task InvalidateAsync(int locationId, DateOnly date) =>
        redis.GetDatabase().KeyDeleteAsync(Key(locationId, date));
}
