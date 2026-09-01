using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using SaloonApi.Shared.Json;
using Xunit;

namespace SaloonApi.Tests;

[SuppressMessage("Design", "CA1515:Consider making public types internal", Justification = "xUnit test classes must be public")]
public class TemporalJsonConvertersTests
{
    private readonly JsonSerializerOptions _options;

    public TemporalJsonConvertersTests()
    {
        _options = new JsonSerializerOptions();
        _options.Converters.Add(new TemporalJsonConverterFactory());
    }

    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated via JsonSerializer")]
    internal sealed record TemporalTestDto(
        TimeSpan? NullableTimeSpan,
        TimeSpan NonNullableTimeSpan,
        DateOnly? NullableDateOnly,
        DateOnly NonNullableDateOnly,
        TimeOnly? NullableTimeOnly,
        TimeOnly NonNullableTimeOnly,
        DateTime? NullableDateTime,
        DateTimeOffset? NullableDateTimeOffset);

    [Fact]
    public void DeserializesEmptyStringsAsNullForNullableTemporalTypes()
    {
        const string json = """
        {
            "NullableTimeSpan": "",
            "NonNullableTimeSpan": "09:00:00",
            "NullableDateOnly": "   ",
            "NonNullableDateOnly": "2026-09-01",
            "NullableTimeOnly": "",
            "NonNullableTimeOnly": "18:00:00",
            "NullableDateTime": "",
            "NullableDateTimeOffset": ""
        }
        """;

        var result = JsonSerializer.Deserialize<TemporalTestDto>(json, _options);

        Assert.NotNull(result);
        Assert.Null(result.NullableTimeSpan);
        Assert.Equal(new TimeSpan(9, 0, 0), result.NonNullableTimeSpan);
        Assert.Null(result.NullableDateOnly);
        Assert.Equal(new DateOnly(2026, 9, 1), result.NonNullableDateOnly);
        Assert.Null(result.NullableTimeOnly);
        Assert.Equal(new TimeOnly(18, 0, 0), result.NonNullableTimeOnly);
        Assert.Null(result.NullableDateTime);
        Assert.Null(result.NullableDateTimeOffset);
    }

    [Fact]
    public void DeserializesValidValuesProperly()
    {
        const string json = """
        {
            "NullableTimeSpan": "13:30:00",
            "NonNullableTimeSpan": "09:00:00",
            "NullableDateOnly": "2026-12-25",
            "NonNullableDateOnly": "2026-09-01",
            "NullableTimeOnly": "14:15:00",
            "NonNullableTimeOnly": "18:00:00",
            "NullableDateTime": "2026-09-01T10:00:00Z",
            "NullableDateTimeOffset": "2026-09-01T10:00:00+05:30"
        }
        """;

        var result = JsonSerializer.Deserialize<TemporalTestDto>(json, _options);

        Assert.NotNull(result);
        Assert.Equal(new TimeSpan(13, 30, 0), result.NullableTimeSpan);
        Assert.Equal(new DateOnly(2026, 12, 25), result.NullableDateOnly);
        Assert.Equal(new TimeOnly(14, 15, 0), result.NullableTimeOnly);
        Assert.NotNull(result.NullableDateTime);
        Assert.NotNull(result.NullableDateTimeOffset);
    }
}
