namespace SaloonApi.Shared.Cors;

internal sealed class CorsOptions
{
    // Comma/semicolon/whitespace-separated list of allowed origins.
    public string AllowedOrigins { get; set; } = "http://localhost:5173";
}
