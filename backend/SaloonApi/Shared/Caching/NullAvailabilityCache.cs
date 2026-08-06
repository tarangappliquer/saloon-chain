namespace SaloonApi.Shared.Caching;

internal sealed class NullAvailabilityCache : IAvailabilityCache
{
    public Task<string?> GetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds) =>
        Task.FromResult<string?>(null);

    public Task SetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds, string json, TimeSpan ttl) =>
        Task.CompletedTask;

    public Task InvalidateAsync(int locationId, DateOnly date) =>
        Task.CompletedTask;
}
