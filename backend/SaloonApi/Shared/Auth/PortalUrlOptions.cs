namespace SaloonApi.Shared.Auth;

// Base URLs for building links inside emails (password-reset, set-your-password) -- AuthService picks
// AdminPortalUrl for staff accounts and ClientPortalUrl for customers, matching each portal's own
// role split (see AuthEndpoints' Portal login hint).
internal sealed class PortalUrlOptions
{
    public string AdminPortalUrl { get; init; } = "http://localhost:58562";
    public string ClientPortalUrl { get; init; } = "http://localhost:58569";
}
