using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SaloonApi.Shared.Json;

internal sealed class LongToStringJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert)
    {
        return typeToConvert == typeof(long) || typeToConvert == typeof(long?);
    }

    public override JsonConverter? CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        if (typeToConvert == typeof(long))
        {
            return new LongToStringJsonConverter();
        }

        if (typeToConvert == typeof(long?))
        {
            return new NullableLongToStringJsonConverter();
        }

        return null;
    }
}

internal sealed class LongToStringJsonConverter : JsonConverter<long>
{
    public override long Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            if (long.TryParse(reader.GetString(), CultureInfo.InvariantCulture, out var result))
            {
                return result;
            }
        }
        else if (reader.TokenType == JsonTokenType.Number)
        {
            return reader.GetInt64();
        }

        throw new JsonException($"Unable to convert JSON token '{reader.TokenType}' to long.");
    }

    public override void Write(Utf8JsonWriter writer, long value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
    }
}

internal sealed class NullableLongToStringJsonConverter : JsonConverter<long?>
{
    public override long? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrEmpty(str))
            {
                return null;
            }

            if (long.TryParse(str, CultureInfo.InvariantCulture, out var result))
            {
                return result;
            }
        }
        else if (reader.TokenType == JsonTokenType.Number)
        {
            return reader.GetInt64();
        }

        throw new JsonException($"Unable to convert JSON token '{reader.TokenType}' to long?.");
    }

    public override void Write(Utf8JsonWriter writer, long? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);

        if (value.HasValue)
        {
            writer.WriteStringValue(value.Value.ToString(CultureInfo.InvariantCulture));
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
