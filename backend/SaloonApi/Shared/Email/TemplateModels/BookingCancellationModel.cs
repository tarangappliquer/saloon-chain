using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Email.TemplateModels;

[SuppressMessage("Design", "CA1515:Consider making public types internal", Justification = "RazorEngineCore dynamic template execution requires public model classes.")]
public sealed class BookingCancellationModel
{
    public required string CustomerName { get; init; }
    public required string AppointmentNumber { get; init; }
    public required string LocationName { get; init; }
    public required IReadOnlyList<BookingTreatmentDetailModel> Treatments { get; init; }
}
