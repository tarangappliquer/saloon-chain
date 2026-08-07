using Microsoft.Extensions.Options;

namespace SaloonApi.Tests;

internal static class TestOptionsMonitor
{
    public static IOptionsMonitor<T> Create<T>(T value) where T : class, new() =>
        new TestOptionsMonitorImpl<T>(value);

    private sealed class TestOptionsMonitorImpl<T>(T value) : IOptionsMonitor<T> where T : class, new()
    {
        public T CurrentValue => value;
        public T Get(string? name) => value;
        public IDisposable? OnChange(Action<T, string?> listener) => null;
    }
}
