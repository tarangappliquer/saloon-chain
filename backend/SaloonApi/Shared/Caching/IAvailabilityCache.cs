namespace SaloonApi.Shared.Caching;

internal interface IAvailabilityCache
{
    Task<string?> GetAsync(int locationId, DateOnly date);
    Task SetAsync(int locationId, DateOnly date, string json, TimeSpan ttl);
    Task InvalidateAsync(int locationId, DateOnly date);
}
