namespace SaloonApi.Shared.Auth;

public sealed class JwtOptions
{
    public string SigningKey { get; init; } = "";
    public string Issuer { get; init; } = "SaloonApi";
    public string Audience { get; init; } = "SaloonClients";
    public int ExpiryMinutes { get; init; } = 120;
}
