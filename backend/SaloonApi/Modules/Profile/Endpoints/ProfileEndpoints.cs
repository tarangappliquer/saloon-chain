using FluentValidation;
using SaloonApi.Modules.Profile.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Profile.Endpoints;

internal static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/profile").RequireAuthorization().WithTags("Profile")
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        group.MapGet("", async (ICurrentUser currentUser, ProfileRepository repo) =>
        {
            var profile = await repo.GetMyProfileAsync(currentUser.RequireUserId(), currentUser.Role!.Value);
            return profile is null ? Results.NotFound() : Results.Ok(ToResponse(profile));
        }).Produces<ProfileResponse>()
          .Produces(StatusCodes.Status404NotFound)
          .WithDescription("Get the caller's own profile.");

        group.MapPut("", async (UpdateProfileRequest req, ICurrentUser currentUser, ProfileRepository repo, SaloonApi.Modules.Payment.Application.StripeCustomerService stripeCustomerService) =>
        {
            if (currentUser.EmulatedByUserId is not null)
                return Results.Problem("Profile updates are not allowed during an emulation session.", statusCode: StatusCodes.Status403Forbidden);

            var userId = currentUser.RequireUserId();
            await repo.UpdateSelfAsync(userId, req.Name, req.Phone);
            if (currentUser.Email is not null)
            {
                await stripeCustomerService.SyncCustomerAsync(userId, req.Name, currentUser.Email, req.Phone);
            }
            var profile = await repo.GetMyProfileAsync(userId, currentUser.Role!.Value);
            return Results.Ok(ToResponse(profile!));
        }).WithValidation<UpdateProfileRequest>()
          .Produces<ProfileResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update the caller's own name/phone.");
    }

    private static ProfileResponse ToResponse(ProfileDto p) =>
        new(p.Id, p.Name, p.Email, p.Phone, p.Role.ToString(), p.PhotoPath);
}

internal sealed record UpdateProfileRequest(string Name, string? Phone);
internal sealed record ProfileResponse(int UserId, string Name, string Email, string? Phone, string Role, string? PhotoPath);

internal sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}
