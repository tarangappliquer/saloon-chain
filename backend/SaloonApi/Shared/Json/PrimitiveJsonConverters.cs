using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SaloonApi.Shared.Json;

internal sealed class PrimitiveJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert == typeof(int) ||
        typeToConvert == typeof(int?) ||
        typeToConvert == typeof(uint) ||
        typeToConvert == typeof(uint?) ||
        typeToConvert == typeof(short) ||
        typeToConvert == typeof(short?) ||
        typeToConvert == typeof(ushort) ||
        typeToConvert == typeof(ushort?) ||
        typeToConvert == typeof(byte) ||
        typeToConvert == typeof(byte?) ||
        typeToConvert == typeof(sbyte) ||
        typeToConvert == typeof(sbyte?) ||
        typeToConvert == typeof(decimal) ||
        typeToConvert == typeof(decimal?) ||
        typeToConvert == typeof(double) ||
        typeToConvert == typeof(double?) ||
        typeToConvert == typeof(float) ||
        typeToConvert == typeof(float?) ||
        typeToConvert == typeof(bool) ||
        typeToConvert == typeof(bool?) ||
        typeToConvert == typeof(Guid) ||
        typeToConvert == typeof(Guid?);

    public override JsonConverter? CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        if (typeToConvert == typeof(int)) return new IntJsonConverter();
        if (typeToConvert == typeof(int?)) return new NullableIntJsonConverter();
        if (typeToConvert == typeof(uint)) return new UIntJsonConverter();
        if (typeToConvert == typeof(uint?)) return new NullableUIntJsonConverter();
        if (typeToConvert == typeof(short)) return new ShortJsonConverter();
        if (typeToConvert == typeof(short?)) return new NullableShortJsonConverter();
        if (typeToConvert == typeof(ushort)) return new UShortJsonConverter();
        if (typeToConvert == typeof(ushort?)) return new NullableUShortJsonConverter();
        if (typeToConvert == typeof(byte)) return new ByteJsonConverter();
        if (typeToConvert == typeof(byte?)) return new NullableByteJsonConverter();
        if (typeToConvert == typeof(sbyte)) return new SByteJsonConverter();
        if (typeToConvert == typeof(sbyte?)) return new NullableSByteJsonConverter();
        if (typeToConvert == typeof(decimal)) return new DecimalJsonConverter();
        if (typeToConvert == typeof(decimal?)) return new NullableDecimalJsonConverter();
        if (typeToConvert == typeof(double)) return new DoubleJsonConverter();
        if (typeToConvert == typeof(double?)) return new NullableDoubleJsonConverter();
        if (typeToConvert == typeof(float)) return new FloatJsonConverter();
        if (typeToConvert == typeof(float?)) return new NullableFloatJsonConverter();
        if (typeToConvert == typeof(bool)) return new BoolJsonConverter();
        if (typeToConvert == typeof(bool?)) return new NullableBoolJsonConverter();
        if (typeToConvert == typeof(Guid)) return new GuidJsonConverter();
        if (typeToConvert == typeof(Guid?)) return new NullableGuidJsonConverter();
        return null;
    }
}

internal sealed class IntJsonConverter : JsonConverter<int>
{
    public override int Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (int.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to int.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing int.");
    }

    public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableIntJsonConverter : JsonConverter<int?>
{
    public override int? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (int.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to int?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing int?.");
    }

    public override void Write(Utf8JsonWriter writer, int? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class UIntJsonConverter : JsonConverter<uint>
{
    public override uint Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetUInt32();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (uint.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to uint.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing uint.");
    }

    public override void Write(Utf8JsonWriter writer, uint value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableUIntJsonConverter : JsonConverter<uint?>
{
    public override uint? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetUInt32();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (uint.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to uint?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing uint?.");
    }

    public override void Write(Utf8JsonWriter writer, uint? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class ShortJsonConverter : JsonConverter<short>
{
    public override short Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt16();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (short.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to short.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing short.");
    }

    public override void Write(Utf8JsonWriter writer, short value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableShortJsonConverter : JsonConverter<short?>
{
    public override short? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt16();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (short.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to short?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing short?.");
    }

    public override void Write(Utf8JsonWriter writer, short? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class UShortJsonConverter : JsonConverter<ushort>
{
    public override ushort Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetUInt16();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (ushort.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to ushort.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing ushort.");
    }

    public override void Write(Utf8JsonWriter writer, ushort value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableUShortJsonConverter : JsonConverter<ushort?>
{
    public override ushort? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetUInt16();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (ushort.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to ushort?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing ushort?.");
    }

    public override void Write(Utf8JsonWriter writer, ushort? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class ByteJsonConverter : JsonConverter<byte>
{
    public override byte Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetByte();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (byte.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to byte.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing byte.");
    }

    public override void Write(Utf8JsonWriter writer, byte value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableByteJsonConverter : JsonConverter<byte?>
{
    public override byte? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetByte();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (byte.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to byte?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing byte?.");
    }

    public override void Write(Utf8JsonWriter writer, byte? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class SByteJsonConverter : JsonConverter<sbyte>
{
    public override sbyte Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetSByte();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (sbyte.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to sbyte.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing sbyte.");
    }

    public override void Write(Utf8JsonWriter writer, sbyte value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableSByteJsonConverter : JsonConverter<sbyte?>
{
    public override sbyte? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetSByte();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (sbyte.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to sbyte?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing sbyte?.");
    }

    public override void Write(Utf8JsonWriter writer, sbyte? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class DecimalJsonConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetDecimal();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (decimal.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to decimal.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing decimal.");
    }

    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableDecimalJsonConverter : JsonConverter<decimal?>
{
    public override decimal? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetDecimal();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (decimal.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to decimal?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing decimal?.");
    }

    public override void Write(Utf8JsonWriter writer, decimal? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class DoubleJsonConverter : JsonConverter<double>
{
    public override double Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetDouble();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (double.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to double.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing double.");
    }

    public override void Write(Utf8JsonWriter writer, double value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableDoubleJsonConverter : JsonConverter<double?>
{
    public override double? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetDouble();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (double.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to double?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing double?.");
    }

    public override void Write(Utf8JsonWriter writer, double? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class FloatJsonConverter : JsonConverter<float>
{
    public override float Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number) return reader.GetSingle();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (float.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to float.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing float.");
    }

    public override void Write(Utf8JsonWriter writer, float value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(value);
    }
}

internal sealed class NullableFloatJsonConverter : JsonConverter<float?>
{
    public override float? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.Number) return reader.GetSingle();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (float.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to float?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing float?.");
    }

    public override void Write(Utf8JsonWriter writer, float? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteNumberValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class BoolJsonConverter : JsonConverter<bool>
{
    public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType is JsonTokenType.True or JsonTokenType.False) return reader.GetBoolean();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (bool.TryParse(str, out var b)) return b;
            if (str == "1") return true;
            if (str == "0") return false;
            throw new JsonException($"Unable to convert \"{str}\" to bool.");
        }
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32() != 0;
        throw new JsonException($"Unexpected token {reader.TokenType} parsing bool.");
    }

    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteBooleanValue(value);
    }
}

internal sealed class NullableBoolJsonConverter : JsonConverter<bool?>
{
    public override bool? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType is JsonTokenType.True or JsonTokenType.False) return reader.GetBoolean();
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (bool.TryParse(str, out var b)) return b;
            if (str == "1") return true;
            if (str == "0") return false;
            throw new JsonException($"Unable to convert \"{str}\" to bool?.");
        }
        if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32() != 0;
        throw new JsonException($"Unexpected token {reader.TokenType} parsing bool?.");
    }

    public override void Write(Utf8JsonWriter writer, bool? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteBooleanValue(value.Value);
        else writer.WriteNullValue();
    }
}

internal sealed class GuidJsonConverter : JsonConverter<Guid>
{
    public override Guid Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return Guid.Empty;
            if (Guid.TryParse(str, out var g)) return g;
            throw new JsonException($"Unable to convert \"{str}\" to Guid.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing Guid.");
    }

    public override void Write(Utf8JsonWriter writer, Guid value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString());
    }
}

internal sealed class NullableGuidJsonConverter : JsonConverter<Guid?>
{
    public override Guid? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (Guid.TryParse(str, out var g)) return g;
            throw new JsonException($"Unable to convert \"{str}\" to Guid?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing Guid?.");
    }

    public override void Write(Utf8JsonWriter writer, Guid? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue) writer.WriteStringValue(value.Value.ToString());
        else writer.WriteNullValue();
    }
}
