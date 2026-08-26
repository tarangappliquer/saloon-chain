namespace SaloonApi.Shared.Email.TemplateModels;

public sealed class DeveloperErrorNotificationModel
{
    public required string ContextName { get; init; }
    public required string Timestamp { get; init; }
    public string? Method { get; init; }
    public string? Path { get; init; }
    public string? FullUrl { get; init; }
    public string? TraceId { get; init; }
    public string? QueryParams { get; init; }
    public string? RequestBody { get; init; }
    public required string ExceptionDetails { get; init; }
}
