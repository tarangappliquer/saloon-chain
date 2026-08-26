using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Email.TemplateModels;

[SuppressMessage("Design", "CA1515:Consider making public types internal", Justification = "RazorEngineCore dynamic template execution requires public model classes.")]
public sealed class StaffUnattendedAlertModel
{
    public required string ManagerName { get; init; }
    public required string AssignedStaffName { get; init; }
    public string? AssignedStaffEmail { get; init; }
    public required int BookingId { get; init; }
    public required string TreatmentName { get; init; }
    public required int LeadTimeMinutes { get; init; }
    public required string StartTimeFormatted { get; init; }
    public required string LocationName { get; init; }
    public required string CustomerName { get; init; }
}
