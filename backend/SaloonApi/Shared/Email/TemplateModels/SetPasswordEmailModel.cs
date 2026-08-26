using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Email.TemplateModels;

[SuppressMessage("Design", "CA1515:Consider making public types internal", Justification = "RazorEngineCore dynamic template execution requires public model classes.")]
public sealed class SetPasswordEmailModel
{
    public required string RecipientName { get; init; }
    public required string IntroText { get; init; }
    public required string ResetLink { get; init; }
    public required string ActionLabel { get; init; }
}
