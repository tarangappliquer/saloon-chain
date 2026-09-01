using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace SaloonApi.Shared.OpenApi;

/// <summary>
/// Normalizes OpenAPI 3.1 schemas (which support array-valued types like ["integer", "string"]
/// or ["null", "string"] produced by MicroElements FluentValidation) down to standard OpenAPI 3.0
/// single-value schema types so @openapitools/openapi-generator-cli generates precise TypeScript DTOs.
/// </summary>
internal sealed class OpenApi30NormalizeTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        var visited = new HashSet<OpenApiSchema>();

        if (document.Components?.Schemas != null)
        {
            foreach (var schema in document.Components.Schemas.Values)
            {
                NormalizeSchema(schema, visited);
            }
        }

        if (document.Paths != null)
        {
            foreach (var pathItem in document.Paths.Values)
            {
                var operations = pathItem.Operations?.Values ?? Enumerable.Empty<OpenApiOperation>();
                foreach (var op in operations)
                {
                    if (op.Parameters != null)
                    {
                        foreach (var param in op.Parameters)
                        {
                            NormalizeSchema(param.Schema, visited);
                        }
                    }

                    if (op.RequestBody?.Content != null)
                    {
                        foreach (var mediaType in op.RequestBody.Content.Values)
                        {
                            NormalizeSchema(mediaType.Schema, visited);
                        }
                    }

                    if (op.Responses != null)
                    {
                        var contents = op.Responses.Values
                            .Where(r => r.Content != null)
                            .SelectMany(r => r.Content!.Values);

                        foreach (var mediaType in contents)
                        {
                            NormalizeSchema(mediaType.Schema, visited);
                        }
                    }
                }
            }
        }

        return Task.CompletedTask;
    }

    private static void NormalizeSchema(IOpenApiSchema? rawSchema, HashSet<OpenApiSchema> visited)
    {
        if (rawSchema is not OpenApiSchema schema || !visited.Add(schema)) return;

        var type = schema.Type ?? JsonSchemaType.Null;

        if (schema.Format == "int64")
        {
            schema.Type = JsonSchemaType.String;
            schema.Pattern = null;
        }
        else if (schema.Format == "int32" || (type & JsonSchemaType.Integer) != 0)
        {
            schema.Type = JsonSchemaType.Integer;
            schema.Pattern = null;
        }
        else if (schema.Format == "float" || schema.Format == "double" || (type & JsonSchemaType.Number) != 0)
        {
            schema.Type = JsonSchemaType.Number;
            schema.Pattern = null;
        }
        else if ((type & JsonSchemaType.Boolean) != 0)
        {
            schema.Type = JsonSchemaType.Boolean;
        }
        else if ((type & JsonSchemaType.Array) != 0)
        {
            schema.Type = JsonSchemaType.Array;
        }
        else if ((type & JsonSchemaType.Object) != 0)
        {
            schema.Type = JsonSchemaType.Object;
        }
        else if ((type & JsonSchemaType.String) != 0 || schema.Format == "date" || schema.Format == "date-time" || schema.Format == "time" || schema.Format == "duration" || schema.Format == "uuid" || schema.Format == "uri")
        {
            schema.Type = JsonSchemaType.String;
        }

        if (schema.Items != null)
        {
            NormalizeSchema(schema.Items, visited);
        }

        if (schema.Properties != null)
        {
            foreach (var (key, prop) in schema.Properties.ToList())
            {
                if (prop is OpenApiSchema propSchema && propSchema.OneOf != null && propSchema.OneOf.Count == 2)
                {
                    var nullItem = propSchema.OneOf.FirstOrDefault(s => (s as OpenApiSchema)?.Type == JsonSchemaType.Null);
                    var validItem = propSchema.OneOf.FirstOrDefault(s => (s as OpenApiSchema)?.Type != JsonSchemaType.Null);
                    if (nullItem != null && validItem != null)
                    {
                        schema.Properties[key] = validItem;
                    }
                }
                NormalizeSchema(schema.Properties[key], visited);
            }
        }

        if (schema.AdditionalProperties != null)
        {
            NormalizeSchema(schema.AdditionalProperties, visited);
        }
    }
}
