using FluentValidation;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Profile.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Realtime;
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

        // Doesn't change Users.Email itself -- stages the change and mails a confirmation link to
        // the new address (AuthService.RequestEmailChangeAsync); the change only takes effect once
        // that link is clicked (see /api/auth/email/confirm).
        group.MapPost("/email/change-request", async (ChangeEmailRequest req, ICurrentUser currentUser, AuthService auth, ProfileRepository repo) =>
        {
            if (currentUser.EmulatedByUserId is not null)
                return Results.Problem("Email changes are not allowed during an emulation session.", statusCode: StatusCodes.Status403Forbidden);

            if (string.Equals(req.NewEmail, currentUser.Email, StringComparison.OrdinalIgnoreCase))
                return Results.Problem("This is already your current email address.", statusCode: StatusCodes.Status400BadRequest);

            var userId = currentUser.RequireUserId();
            var profile = await repo.GetMyProfileAsync(userId, currentUser.Role!.Value);
            await auth.RequestEmailChangeAsync(userId, currentUser.Role.Value, profile!.Name, req.NewEmail);
            return Results.Ok();
        }).WithValidation<ChangeEmailRequest>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Request an email change -- mails a confirmation link to the new address; the email isn't changed until confirmed.");

        // Re-sends a verification link for the caller's own CURRENT address (portal access is
        // gated on IsEmailVerified -- see RequireAuth in each app's App.tsx). Reuses
        // RequestEmailChangeAsync with NewEmail = the caller's own email; sp_Auth_CreateEmailChangeToken
        // excludes @UserId from its uniqueness check specifically so this doesn't self-conflict.
        group.MapPost("/email/verify-request", async (ICurrentUser currentUser, AuthService auth, ProfileRepository repo) =>
        {
            if (currentUser.EmulatedByUserId is not null)
                return Results.Problem("Email changes are not allowed during an emulation session.", statusCode: StatusCodes.Status403Forbidden);

            var userId = currentUser.RequireUserId();
            var profile = await repo.GetMyProfileAsync(userId, currentUser.Role!.Value);
            await auth.RequestEmailChangeAsync(userId, currentUser.Role.Value, profile!.Name, profile.Email);
            return Results.Ok();
        }).ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Request a verification email for the caller's current (unverified) address.");

        // Anonymous, outside the authenticated group (mirrors /api/booking/stream): EventSource
        // can't send an Authorization header, and the event itself carries no payload beyond "your
        // email just got verified, refetch your profile" -- same "signal only" trust model as the
        // booking slot-changed stream.
        app.MapGet("/api/profile/stream", async (int userId, HttpContext ctx, SseBroadcaster sse, CancellationToken ct) =>
        {
            ctx.Response.Headers.ContentType = "text/event-stream";
            var (id, reader) = sse.Subscribe(SseBroadcaster.UserGroup(userId));
            try
            {
                await foreach (var message in reader.ReadAllAsync(ct))
                {
                    var eventName = string.Equals(message, "user-logged-out", StringComparison.OrdinalIgnoreCase)
                        ? "user-logged-out"
                        : "email-verified";
                    await ctx.Response.WriteAsync($"event: {eventName}\ndata: {message}\n\n", ct);
                    await ctx.Response.Body.FlushAsync(ct);
                }
            }
            finally
            {
                sse.Unsubscribe(id);
            }
        }).WithTags("Profile")
          .WithDescription("Server-sent events stream: notifies when the given user's email has been verified.");
    }

    private static ProfileResponse ToResponse(ProfileDto p) =>
        new(p.Id, p.Name, p.Email, p.Phone, p.Role.ToString(), p.PhotoPath, p.IsEmailVerified);
}

internal sealed record UpdateProfileRequest(string Name, string? Phone);
internal sealed record ChangeEmailRequest(string NewEmail);
internal sealed record ProfileResponse(int UserId, string Name, string Email, string? Phone, string Role, string? PhotoPath, bool IsEmailVerified);

internal sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}

internal sealed class ChangeEmailRequestValidator : AbstractValidator<ChangeEmailRequest>
{
    public ChangeEmailRequestValidator()
    {
        RuleFor(x => x.NewEmail).NotEmpty().EmailAddress().MaximumLength(256);
    }
}
