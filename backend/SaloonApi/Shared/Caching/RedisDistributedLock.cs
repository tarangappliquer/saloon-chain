using StackExchange.Redis;

namespace SaloonApi.Shared.Caching;

// Keeps periodic/singleton background jobs from double-running (and double-emailing/double-sweeping)
// once the API scales to multiple stateless nodes. Uses StackExchange.Redis's built-in lock primitive
// rather than hand-rolling SET NX.
internal static class RedisDistributedLock
{
    public static async Task<bool> TryRunAsync(
        IRedisConnectionProvider redisProvider,
        string lockKey,
        TimeSpan ttl,
        Func<Task> action)
    {
        var redis = redisProvider.GetMultiplexer();
        if (redis is null)
        {
            // ponytail: no Redis configured (single-node/dev) -- run unlocked instead of skipping the job.
            await action();
            return true;
        }

        IDatabase db = redis.GetDatabase();
        string token = Environment.MachineName + ":" + Guid.NewGuid();

        if (!await db.LockTakeAsync(lockKey, token, ttl))
        {
            return false;
        }

        try
        {
            await action();
        }
        finally
        {
            await db.LockReleaseAsync(lockKey, token);
        }

        return true;
    }
}
