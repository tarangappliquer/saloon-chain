namespace SaloonApi.Shared.Email.TemplateModels;

public sealed class ProxyStaffAssignedModel
{
    public required string ManagerName { get; init; }
    public required string ProxyTherapistName { get; init; }
    public required int BookingId { get; init; }
    public required string TreatmentName { get; init; }
    public required string LocationName { get; init; }
    public string? OriginalTherapistName { get; init; }
    public required string CustomerName { get; init; }
    public required string TimeRangeFormatted { get; init; }
    public string? AssignedBy { get; init; }
}
