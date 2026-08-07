namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthOptions
{
    public bool RequireEmailVerification { get; set; } = true;
    public int SetPasswordExpiryHours { get; set; } = 72;
    public int ForgotPasswordExpiryHours { get; set; } = 1;
    public int EmailChangeExpiryHours { get; set; } = 24;
}
