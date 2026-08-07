namespace SaloonApi.Shared.Cors;

internal sealed class CorsOptions
{
    public string[] AllowedOrigins { get; set; } = ["http://localhost:5173"];
}
