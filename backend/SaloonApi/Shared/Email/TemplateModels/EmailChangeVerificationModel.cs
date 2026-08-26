namespace SaloonApi.Shared.Email.TemplateModels;

public sealed class EmailChangeVerificationModel
{
    public required string RecipientName { get; init; }
    public required string ConfirmLink { get; init; }
}
