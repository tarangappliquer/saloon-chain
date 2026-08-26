using SaloonApi.Shared.Email.TemplateModels;

namespace SaloonApi.Shared.Email;

internal interface IEmailBodyBuilder
{
    Task<string> BuildDeveloperErrorAlertAsync(DeveloperErrorNotificationModel model, CancellationToken ct = default);
    Task<string> BuildSetPasswordAsync(SetPasswordEmailModel model, CancellationToken ct = default);
    Task<string> BuildEmailChangeVerificationAsync(EmailChangeVerificationModel model, CancellationToken ct = default);
    Task<string> BuildStaffUnattendedAlertAsync(StaffUnattendedAlertModel model, CancellationToken ct = default);
    Task<string> BuildProxyStaffAssignedAsync(ProxyStaffAssignedModel model, CancellationToken ct = default);
    Task<string> BuildBookingConfirmationAsync(BookingConfirmationModel model, CancellationToken ct = default);
    Task<string> BuildBookingCancellationAsync(BookingCancellationModel model, CancellationToken ct = default);
}
