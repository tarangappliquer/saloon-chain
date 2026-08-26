using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Email.TemplateModels;

[SuppressMessage("Design", "CA1515:Consider making public types internal", Justification = "RazorEngineCore dynamic template execution requires public model classes.")]
public sealed class BookingTreatmentDetailModel
{
    public required string TreatmentName { get; init; }
    public required string FormattedTime { get; init; }
    public required string TherapistName { get; init; }
    public required string FormattedPrice { get; init; }
}

[SuppressMessage("Design", "CA1515:Consider making public types internal", Justification = "RazorEngineCore dynamic template execution requires public model classes.")]
public sealed class BookingConfirmationModel
{
    public required string CustomerName { get; init; }
    public required string AppointmentNumber { get; init; }
    public required string LocationName { get; init; }
    public required IReadOnlyList<BookingTreatmentDetailModel> Treatments { get; init; }
}
