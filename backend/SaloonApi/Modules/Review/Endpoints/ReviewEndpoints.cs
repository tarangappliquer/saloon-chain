using FluentValidation;
using SaloonApi.Modules.Review.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Review.Endpoints;

internal static class ReviewEndpoints
{
    public static void MapReviewEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/reviews").RequireAuthorization().WithTags("Review")
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        group.MapPost("", async (CreateReviewRequest req, ICurrentUser currentUser, ReviewRepository repo) =>
        {
            var id = await repo.CreateAsync(req.BookingId, currentUser.RequireUserId(), req.Rating, req.Comment);
            return Results.Ok(new IdResponse(id));
        }).WithValidation<CreateReviewRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Leave a review for a completed booking (Confirmed, every treatment's EndTime passed, not already reviewed).");
    }
}

internal sealed record IdResponse(int Id);
internal sealed record CreateReviewRequest(int BookingId, byte Rating, string? Comment = null);

internal sealed class CreateReviewRequestValidator : AbstractValidator<CreateReviewRequest>
{
    public CreateReviewRequestValidator()
    {
        RuleFor(x => x.BookingId).GreaterThan(0);
        RuleFor(x => x.Rating).InclusiveBetween((byte)1, (byte)5);
        RuleFor(x => x.Comment).MaximumLength(1000);
    }
}
