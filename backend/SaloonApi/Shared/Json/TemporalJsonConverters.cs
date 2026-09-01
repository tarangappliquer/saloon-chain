using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SaloonApi.Shared.Json;

internal sealed class TemporalJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert == typeof(TimeSpan) ||
        typeToConvert == typeof(TimeSpan?) ||
        typeToConvert == typeof(DateOnly) ||
        typeToConvert == typeof(DateOnly?) ||
        typeToConvert == typeof(TimeOnly) ||
        typeToConvert == typeof(TimeOnly?) ||
        typeToConvert == typeof(DateTime) ||
        typeToConvert == typeof(DateTime?) ||
        typeToConvert == typeof(DateTimeOffset) ||
        typeToConvert == typeof(DateTimeOffset?);

    public override JsonConverter? CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        if (typeToConvert == typeof(TimeSpan)) return new TimeSpanJsonConverter();
        if (typeToConvert == typeof(TimeSpan?)) return new NullableTimeSpanJsonConverter();
        if (typeToConvert == typeof(DateOnly)) return new DateOnlyJsonConverter();
        if (typeToConvert == typeof(DateOnly?)) return new NullableDateOnlyJsonConverter();
        if (typeToConvert == typeof(TimeOnly)) return new TimeOnlyJsonConverter();
        if (typeToConvert == typeof(TimeOnly?)) return new NullableTimeOnlyJsonConverter();
        if (typeToConvert == typeof(DateTime)) return new DateTimeJsonConverter();
        if (typeToConvert == typeof(DateTime?)) return new NullableDateTimeJsonConverter();
        if (typeToConvert == typeof(DateTimeOffset)) return new DateTimeOffsetJsonConverter();
        if (typeToConvert == typeof(DateTimeOffset?)) return new NullableDateTimeOffsetJsonConverter();
        return null;
    }
}

internal sealed class TimeSpanJsonConverter : JsonConverter<TimeSpan>
{
    public override TimeSpan Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (TimeSpan.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to TimeSpan.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing TimeSpan.");
    }

    public override void Write(Utf8JsonWriter writer, TimeSpan value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture));
    }
}

internal sealed class NullableTimeSpanJsonConverter : JsonConverter<TimeSpan?>
{
    public override TimeSpan? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (TimeSpan.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to TimeSpan?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing TimeSpan?.");
    }

    public override void Write(Utf8JsonWriter writer, TimeSpan? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue)
            writer.WriteStringValue(value.Value.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture));
        else
            writer.WriteNullValue();
    }
}

internal sealed class DateOnlyJsonConverter : JsonConverter<DateOnly>
{
    public override DateOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (DateOnly.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to DateOnly.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing DateOnly.");
    }

    public override void Write(Utf8JsonWriter writer, DateOnly value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }
}

internal sealed class NullableDateOnlyJsonConverter : JsonConverter<DateOnly?>
{
    public override DateOnly? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (DateOnly.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to DateOnly?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing DateOnly?.");
    }

    public override void Write(Utf8JsonWriter writer, DateOnly? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue)
            writer.WriteStringValue(value.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        else
            writer.WriteNullValue();
    }
}

internal sealed class TimeOnlyJsonConverter : JsonConverter<TimeOnly>
{
    public override TimeOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (TimeOnly.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to TimeOnly.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing TimeOnly.");
    }

    public override void Write(Utf8JsonWriter writer, TimeOnly value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
    }
}

internal sealed class NullableTimeOnlyJsonConverter : JsonConverter<TimeOnly?>
{
    public override TimeOnly? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (TimeOnly.TryParse(str, CultureInfo.InvariantCulture, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to TimeOnly?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing TimeOnly?.");
    }

    public override void Write(Utf8JsonWriter writer, TimeOnly? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue)
            writer.WriteStringValue(value.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
        else
            writer.WriteNullValue();
    }
}

internal sealed class DateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (DateTime.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to DateTime.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing DateTime.");
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString("o", CultureInfo.InvariantCulture));
    }
}

internal sealed class NullableDateTimeJsonConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (DateTime.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to DateTime?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing DateTime?.");
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue)
            writer.WriteStringValue(value.Value.ToString("o", CultureInfo.InvariantCulture));
        else
            writer.WriteNullValue();
    }
}

internal sealed class DateTimeOffsetJsonConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return default;
            if (DateTimeOffset.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to DateTimeOffset.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing DateTimeOffset.");
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToString("o", CultureInfo.InvariantCulture));
    }
}

internal sealed class NullableDateTimeOffsetJsonConverter : JsonConverter<DateTimeOffset?>
{
    public override DateTimeOffset? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return null;
            if (DateTimeOffset.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result)) return result;
            throw new JsonException($"Unable to convert \"{str}\" to DateTimeOffset?.");
        }
        throw new JsonException($"Unexpected token {reader.TokenType} parsing DateTimeOffset?.");
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset? value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        if (value.HasValue)
            writer.WriteStringValue(value.Value.ToString("o", CultureInfo.InvariantCulture));
        else
            writer.WriteNullValue();
    }
}
