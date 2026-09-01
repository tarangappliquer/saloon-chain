using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace SaloonApi.Shared.OpenApi;

internal sealed class PrimitiveAndTemporalSchemaTransformer : IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(schema);
        ArgumentNullException.ThrowIfNull(context);

        var type = Nullable.GetUnderlyingType(context.JsonTypeInfo.Type) ?? context.JsonTypeInfo.Type;

        if (type == typeof(bool))
        {
            schema.Type = JsonSchemaType.Boolean;
            schema.Format = null;
        }
        else if (type == typeof(int) || type == typeof(short) || type == typeof(byte) ||
                 type == typeof(sbyte) || type == typeof(ushort) || type == typeof(uint))
        {
            schema.Type = JsonSchemaType.Integer;
            schema.Format = "int32";
        }
        else if (type == typeof(long) || type == typeof(ulong))
        {
            schema.Type = JsonSchemaType.String;
            schema.Format = null;
        }
        else if (type == typeof(decimal))
        {
            schema.Type = JsonSchemaType.Number;
            schema.Format = "decimal";
        }
        else if (type == typeof(double))
        {
            schema.Type = JsonSchemaType.Number;
            schema.Format = "double";
        }
        else if (type == typeof(float))
        {
            schema.Type = JsonSchemaType.Number;
            schema.Format = "float";
        }
        else if (type == typeof(Guid))
        {
            schema.Type = JsonSchemaType.String;
            schema.Format = "uuid";
        }
        else if (type == typeof(TimeSpan) || type == typeof(TimeOnly))
        {
            schema.Type = JsonSchemaType.String;
            schema.Format = "time";
        }
        else if (type == typeof(DateOnly))
        {
            schema.Type = JsonSchemaType.String;
            schema.Format = "date";
        }
        else if (type == typeof(DateTime) || type == typeof(DateTimeOffset))
        {
            schema.Type = JsonSchemaType.String;
            schema.Format = "date-time";
        }

        return Task.CompletedTask;
    }
}
