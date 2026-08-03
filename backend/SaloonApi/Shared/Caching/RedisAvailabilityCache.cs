using StackExchange.Redis;

namespace SaloonApi.Shared.Caching;

// Cache-aside only: the SP under sp_getapplock is the correctness boundary, this just saves a
// round-trip to SQL Server for repeated availability reads. Invalidated on every write.
internal sealed class RedisAvailabilityCache(IConnectionMultiplexer redis) : IAvailabilityCache
{
    private static string DateKey(int locationId, DateOnly date) => $"avail:{locationId}:{date:yyyy-MM-dd}";

    private static string Key(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds) =>
        $"{DateKey(locationId, date)}:{string.Join(",", treatmentIds.OrderBy(id => id))}";

    // A (location, date) write invalidates every treatment-combo cached for it, but InvalidateAsync
    // only knows the date, not which combos are cached -- this set tracks them so they can all be
    // cleared instead of accumulating stale entries until their own TTL happens to expire.
    private static string IndexKey(int locationId, DateOnly date) => $"{DateKey(locationId, date)}:keys";

    public async Task<string?> GetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds)
    {
        RedisValue value = await redis.GetDatabase().StringGetAsync(Key(locationId, date, treatmentIds));
        return value.IsNullOrEmpty ? null : value.ToString();
    }

    public async Task SetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds, string json, TimeSpan ttl)
    {
        IDatabase db = redis.GetDatabase();
        string key = Key(locationId, date, treatmentIds);
        await db.StringSetAsync(key, json, ttl);
        await db.SetAddAsync(IndexKey(locationId, date), key);
    }

    public async Task InvalidateAsync(int locationId, DateOnly date)
    {
        IDatabase db = redis.GetDatabase();
        string indexKey = IndexKey(locationId, date);
        RedisValue[] keys = await db.SetMembersAsync(indexKey);
        if (keys.Length > 0)
            await db.KeyDeleteAsync(Array.ConvertAll(keys, k => (RedisKey)k.ToString()));
        await db.KeyDeleteAsync(indexKey);
    }
}
