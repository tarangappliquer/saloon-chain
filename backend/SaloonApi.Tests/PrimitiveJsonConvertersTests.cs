using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using SaloonApi.Shared.Json;
using Xunit;

namespace SaloonApi.Tests;

[SuppressMessage("Design", "CA1515:Consider making public types internal", Justification = "xUnit test classes must be public")]
public class PrimitiveJsonConvertersTests
{
    private readonly JsonSerializerOptions _options;

    public PrimitiveJsonConvertersTests()
    {
        _options = new JsonSerializerOptions();
        _options.Converters.Add(new LongToStringJsonConverterFactory());
        _options.Converters.Add(new PrimitiveJsonConverterFactory());
    }

    [SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated via JsonSerializer")]
    internal sealed record LargeDataTestDto(
        long BigLong,
        long? NullableBigLong,
        ulong BigULong,
        ulong? NullableBigULong,
        decimal HighPrecisionDecimal,
        decimal? NullableDecimal,
        uint UintVal,
        ushort UshortVal,
        sbyte SbyteVal);

    [Fact]
    public void PreservesFullPrecisionFor64BitIntegersAndDecimalsWithoutDataLoss()
    {
        // Value well beyond JavaScript Number.MAX_SAFE_INTEGER (9007199254740991)
        const long largeLong = 9223372036854775800L;
        const ulong largeULong = 18446744073709551610UL;
        const decimal preciseDecimal = 1234567890123456.789012345678m;

        var original = new LargeDataTestDto(
            BigLong: largeLong,
            NullableBigLong: largeLong,
            BigULong: largeULong,
            NullableBigULong: largeULong,
            HighPrecisionDecimal: preciseDecimal,
            NullableDecimal: preciseDecimal,
            UintVal: 4000000000U,
            UshortVal: 65000,
            SbyteVal: -120);

        var json = JsonSerializer.Serialize(original, _options);
        var deserialized = JsonSerializer.Deserialize<LargeDataTestDto>(json, _options);

        Assert.NotNull(deserialized);
        Assert.Equal(largeLong, deserialized.BigLong);
        Assert.Equal(largeLong, deserialized.NullableBigLong);
        Assert.Equal(largeULong, deserialized.BigULong);
        Assert.Equal(largeULong, deserialized.NullableBigULong);
        Assert.Equal(preciseDecimal, deserialized.HighPrecisionDecimal);
        Assert.Equal(preciseDecimal, deserialized.NullableDecimal);
        Assert.Equal(4000000000U, deserialized.UintVal);
        Assert.Equal((ushort)65000, deserialized.UshortVal);
        Assert.Equal((sbyte)-120, deserialized.SbyteVal);
    }
}
