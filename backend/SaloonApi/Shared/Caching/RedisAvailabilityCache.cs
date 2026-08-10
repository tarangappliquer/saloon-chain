using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace SaloonApi.Shared.Caching;

// Cache-aside only: the SP under sp_getapplock is the correctness boundary, this just saves a
// round-trip to SQL Server for repeated availability reads. Invalidated on every write.
internal sealed class RedisAvailabilityCache(IRedisConnectionProvider connectionProvider, ILogger<RedisAvailabilityCache> logger) : IAvailabilityCache
{
    private static string DateKey(int locationId, DateOnly date) => $"avail:{locationId}:{date:yyyy-MM-dd}";

    private static string Key(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds) =>
        $"{DateKey(locationId, date)}:{string.Join(",", treatmentIds.OrderBy(id => id))}";

    // A (location, date) write invalidates every treatment-combo cached for it, but InvalidateAsync
    // only knows the date, not which combos are cached -- this set tracks them so they can all be
    // cleared instead of accumulating stale entries until their own TTL happens to expire.
    private static string IndexKey(int locationId, DateOnly date) => $"{DateKey(locationId, date)}:keys";

    private static string DatesKey(int locationId, IReadOnlyList<int>? treatmentIds)
    {
        var ids = treatmentIds is { Count: > 0 } ? string.Join(",", treatmentIds.OrderBy(id => id)) : "all";
        return $"avail:dates:{locationId}:{ids}";
    }

    private static string DatesIndexKey(int locationId) => $"avail:dates:{locationId}:keys";

    public async Task<string?> GetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds)
    {
        IConnectionMultiplexer? redis = connectionProvider.GetMultiplexer();
        if (redis is null) return null;

#pragma warning disable CA1031
        try
        {
            RedisValue value = await redis.GetDatabase().StringGetAsync(Key(locationId, date, treatmentIds));
            return value.IsNullOrEmpty ? null : value.ToString();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis availability cache read failed for location {LocationId}, date {Date}. Falling back to database.", locationId, date);
            return null;
        }
#pragma warning restore CA1031
    }

    public async Task SetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds, string json, TimeSpan ttl)
    {
        IConnectionMultiplexer? redis = connectionProvider.GetMultiplexer();
        if (redis is null) return;

#pragma warning disable CA1031
        try
        {
            IDatabase db = redis.GetDatabase();
            string key = Key(locationId, date, treatmentIds);
            await db.StringSetAsync(key, json, ttl);
            await db.SetAddAsync(IndexKey(locationId, date), key);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis availability cache write failed for location {LocationId}, date {Date}.", locationId, date);
        }
#pragma warning restore CA1031
    }

    public async Task<string?> GetDatesAsync(int locationId, IReadOnlyList<int>? treatmentIds)
    {
        IConnectionMultiplexer? redis = connectionProvider.GetMultiplexer();
        if (redis is null) return null;

#pragma warning disable CA1031
        try
        {
            RedisValue value = await redis.GetDatabase().StringGetAsync(DatesKey(locationId, treatmentIds));
            return value.IsNullOrEmpty ? null : value.ToString();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis availability dates cache read failed for location {LocationId}. Falling back to database.", locationId);
            return null;
        }
#pragma warning restore CA1031
    }

    public async Task SetDatesAsync(int locationId, IReadOnlyList<int>? treatmentIds, string json, TimeSpan ttl)
    {
        IConnectionMultiplexer? redis = connectionProvider.GetMultiplexer();
        if (redis is null) return;

#pragma warning disable CA1031
        try
        {
            IDatabase db = redis.GetDatabase();
            string key = DatesKey(locationId, treatmentIds);
            await db.StringSetAsync(key, json, ttl);
            await db.SetAddAsync(DatesIndexKey(locationId), key);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis availability dates cache write failed for location {LocationId}.", locationId);
        }
#pragma warning restore CA1031
    }

    public async Task InvalidateAsync(int locationId, DateOnly date)
    {
        IConnectionMultiplexer? redis = connectionProvider.GetMultiplexer();
        if (redis is null) return;

#pragma warning disable CA1031
        try
        {
            IDatabase db = redis.GetDatabase();
            string indexKey = IndexKey(locationId, date);
            RedisValue[] keys = await db.SetMembersAsync(indexKey);
            if (keys.Length > 0)
                await db.KeyDeleteAsync(Array.ConvertAll(keys, k => (RedisKey)k.ToString()));
            await db.KeyDeleteAsync(indexKey);

            string datesIndexKey = DatesIndexKey(locationId);
            RedisValue[] datesKeys = await db.SetMembersAsync(datesIndexKey);
            if (datesKeys.Length > 0)
                await db.KeyDeleteAsync(Array.ConvertAll(datesKeys, k => (RedisKey)k.ToString()));
            await db.KeyDeleteAsync(datesIndexKey);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Redis availability cache invalidation failed for location {LocationId}, date {Date}.", locationId, date);
        }
#pragma warning restore CA1031
    }
}
