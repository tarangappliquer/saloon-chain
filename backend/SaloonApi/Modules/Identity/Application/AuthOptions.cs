namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthOptions
{
    public bool RequireEmailVerification { get; set; } = true;
}
