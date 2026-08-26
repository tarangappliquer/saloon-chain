namespace SaloonApi.Shared.Email.TemplateModels;

internal sealed class EmailChangeVerificationModel
{
    public required string RecipientName { get; init; }
    public required string ConfirmLink { get; init; }
}
