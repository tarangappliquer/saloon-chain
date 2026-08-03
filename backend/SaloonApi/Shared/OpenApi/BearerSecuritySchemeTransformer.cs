using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace SaloonApi.Shared.OpenApi;

// Registers the Bearer scheme once for the whole document (Scalar/Swagger "Authorize" button),
// then DefaultResponsesOperationTransformer below marks only the endpoints that actually require it.
internal sealed class BearerSecuritySchemeTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        var components = document.Components ??= new OpenApiComponents();
        components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
        };
        return Task.CompletedTask;
    }
}

// Backstop, not the primary source: individual endpoints already declare their real 400/401/403
// branches via .Produces()/.ProducesProblem() (see WithValidation() and the endpoint files). This
// fills in whatever a specific handler didn't declare, so every endpoint's docs still show 400
// (route/query model-binding failures reach every handler, validated or not) and every endpoint
// gated by RequireAuthorization shows both 401 (no/invalid token) and 403 (authenticated but
// rejected by the policy) -- even endpoints using the bare "must be authenticated" policy, since
// documenting the pair as a fixed contract beats reasoning per-endpoint about whether 403 is
// currently reachable. Typed against the same ProblemDetails/HttpValidationProblemDetails schemas
// WithValidation()/.ProducesProblem() already register elsewhere in the document, so these default
// entries aren't bare status codes -- Scalar/generated clients see a real body shape for them too.
internal sealed class DefaultResponsesOperationTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        var responses = operation.Responses ??= new OpenApiResponses();
        responses.TryAdd("400", ProblemResponse("Bad Request", "HttpValidationProblemDetails", context.Document));

        if (context.Description.ActionDescriptor.EndpointMetadata.OfType<IAuthorizeData>().Any())
        {
            var security = operation.Security ??= new List<OpenApiSecurityRequirement>();
            security.Add(new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("Bearer", context.Document)] = [],
            });

            responses.TryAdd("401", ProblemResponse("Unauthorized", "ProblemDetails", context.Document));
            responses.TryAdd("403", ProblemResponse("Forbidden", "ProblemDetails", context.Document));
        }

        return Task.CompletedTask;
    }

    private static OpenApiResponse ProblemResponse(string description, string schemaId, OpenApiDocument? document) =>
        new()
        {
            Description = description,
            Content = new Dictionary<string, OpenApiMediaType>
            {
                ["application/problem+json"] = new()
                {
                    Schema = new OpenApiSchemaReference(schemaId, document),
                },
            },
        };
}
