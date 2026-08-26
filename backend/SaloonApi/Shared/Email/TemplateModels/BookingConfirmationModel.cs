namespace SaloonApi.Shared.Email.TemplateModels;

public sealed class BookingTreatmentDetailModel
{
    public required string TreatmentName { get; init; }
    public required string FormattedTime { get; init; }
    public required string TherapistName { get; init; }
    public required string FormattedPrice { get; init; }
}

public sealed class BookingConfirmationModel
{
    public required string CustomerName { get; init; }
    public required string AppointmentNumber { get; init; }
    public required string LocationName { get; init; }
    public required IReadOnlyList<BookingTreatmentDetailModel> Treatments { get; init; }
}
