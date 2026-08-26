namespace SaloonApi.Shared.Email.TemplateModels;

public sealed class BookingCancellationModel
{
    public required string CustomerName { get; init; }
    public required string AppointmentNumber { get; init; }
    public required string LocationName { get; init; }
    public required IReadOnlyList<BookingTreatmentDetailModel> Treatments { get; init; }
}
