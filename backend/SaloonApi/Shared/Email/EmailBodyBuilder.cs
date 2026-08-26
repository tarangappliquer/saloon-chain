using SaloonApi.Shared.Email.TemplateModels;

namespace SaloonApi.Shared.Email;

internal sealed class EmailBodyBuilder(IRazorTemplateEngine templateEngine) : IEmailBodyBuilder
{
    public Task<string> BuildDeveloperErrorAlertAsync(DeveloperErrorNotificationModel model, CancellationToken ct = default)
        => templateEngine.RenderAsync("DeveloperErrorAlert", model, ct);

    public Task<string> BuildSetPasswordAsync(SetPasswordEmailModel model, CancellationToken ct = default)
        => templateEngine.RenderAsync("SetPassword", model, ct);

    public Task<string> BuildEmailChangeVerificationAsync(EmailChangeVerificationModel model, CancellationToken ct = default)
        => templateEngine.RenderAsync("EmailChangeVerification", model, ct);

    public Task<string> BuildStaffUnattendedAlertAsync(StaffUnattendedAlertModel model, CancellationToken ct = default)
        => templateEngine.RenderAsync("StaffUnattendedAlert", model, ct);

    public Task<string> BuildProxyStaffAssignedAsync(ProxyStaffAssignedModel model, CancellationToken ct = default)
        => templateEngine.RenderAsync("ProxyStaffAssigned", model, ct);

    public Task<string> BuildBookingConfirmationAsync(BookingConfirmationModel model, CancellationToken ct = default)
        => templateEngine.RenderAsync("BookingConfirmation", model, ct);

    public Task<string> BuildBookingCancellationAsync(BookingCancellationModel model, CancellationToken ct = default)
        => templateEngine.RenderAsync("BookingCancellation", model, ct);
}
