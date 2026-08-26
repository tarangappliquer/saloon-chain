namespace SaloonApi.Shared.Email.TemplateModels;

public sealed class SetPasswordEmailModel
{
    public required string RecipientName { get; init; }
    public required string IntroText { get; init; }
    public required string ResetLink { get; init; }
    public required string ActionLabel { get; init; }
}
