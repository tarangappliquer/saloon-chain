using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace SaloonApi.Shared.OpenApi;

internal sealed class LongAsStringSchemaTransformer : IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(schema);
        ArgumentNullException.ThrowIfNull(context);

        if (context.JsonTypeInfo.Type == typeof(long) || context.JsonTypeInfo.Type == typeof(long?))
        {
            schema.Type = JsonSchemaType.String;
            schema.Format = null;
        }

        return Task.CompletedTask;
    }
}
