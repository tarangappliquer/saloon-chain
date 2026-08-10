namespace SaloonApi.Shared.Caching;

internal interface IAvailabilityCache
{
    // Keyed by treatmentIds too, not just (locationId, date) -- different treatments at the same
    // location/date have different durations and eligible rooms, so a shared key would let one
    // treatment's request get served another treatment's cached (wrong-duration, wrong-room) slots.
    Task<string?> GetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds);
    Task SetAsync(int locationId, DateOnly date, IReadOnlyList<int> treatmentIds, string json, TimeSpan ttl);
    Task<string?> GetDatesAsync(int locationId, IReadOnlyList<int>? treatmentIds);
    Task SetDatesAsync(int locationId, IReadOnlyList<int>? treatmentIds, string json, TimeSpan ttl);
    Task InvalidateAsync(int locationId, DateOnly date);
}
