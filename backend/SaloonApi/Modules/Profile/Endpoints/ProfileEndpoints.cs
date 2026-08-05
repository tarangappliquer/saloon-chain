using FluentValidation;
using SaloonApi.Modules.Profile.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Profile.Endpoints;

internal static class ProfileEndpoints
{
    // Only these three (extension, declared content-type) combinations are accepted -- rejects
    // anything else outright rather than trying to sniff real file contents, which is enough for a
    // profile photo (not a security boundary the way an executable-upload path would be).
    private static readonly Dictionary<string, string> AllowedImageTypes = new()
    {
        [".JPG"] = "image/jpeg",
        [".JPEG"] = "image/jpeg",
        [".PNG"] = "image/png",
        [".WEBP"] = "image/webp",
    };

    private const long MaxPhotoBytes = 5 * 1024 * 1024;

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

        group.MapPost("/photo", async (IFormFile file, ICurrentUser currentUser, ProfileRepository repo, IWebHostEnvironment env) =>
        {
            if (currentUser.EmulatedByUserId is not null)
                return Results.Problem("Profile photo updates are not allowed during an emulation session.", statusCode: StatusCodes.Status403Forbidden);

            if (file.Length == 0)
                return Results.Problem("File is empty.", statusCode: StatusCodes.Status400BadRequest);
            if (file.Length > MaxPhotoBytes)
                return Results.Problem("File exceeds the 5 MB limit.", statusCode: StatusCodes.Status400BadRequest);

            var ext = Path.GetExtension(file.FileName).ToUpperInvariant();
            if (!AllowedImageTypes.TryGetValue(ext, out var expectedContentType) || file.ContentType != expectedContentType)
                return Results.Problem("Only JPG, PNG, or WEBP images are allowed.", statusCode: StatusCodes.Status400BadRequest);

            var userId = currentUser.RequireUserId();
            var uploadsDir = Path.Combine(env.ContentRootPath, "uploads", "profile-photos");
            Directory.CreateDirectory(uploadsDir);

            // Named by user id, not the original filename -- avoids path-traversal/collision entirely
            // and doubles as the upsert key. Clear any previous photo first so switching image
            // formats on re-upload doesn't leave an orphaned file behind.
            foreach (var existing in Directory.GetFiles(uploadsDir, $"{userId}.*"))
                File.Delete(existing);

            var fileName = $"{userId}{ext}";
            await using (var stream = File.Create(Path.Combine(uploadsDir, fileName)))
                await file.CopyToAsync(stream);

            var photoPath = $"/uploads/profile-photos/{fileName}";
            await repo.SetPhotoPathAsync(userId, currentUser.Role!.Value, photoPath);
            return Results.Ok(new PhotoResponse(photoPath));
        }).Produces<PhotoResponse>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Upload/replace the caller's own profile photo (JPG/PNG/WEBP, max 5 MB).");
    }

    private static ProfileResponse ToResponse(ProfileDto p) =>
        new(p.Id, p.Name, p.Email, p.Phone, p.Role.ToString(), p.PhotoPath);
}

internal sealed record UpdateProfileRequest(string Name, string? Phone);
internal sealed record ProfileResponse(int UserId, string Name, string Email, string? Phone, string Role, string? PhotoPath);
internal sealed record PhotoResponse(string PhotoPath);

internal sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}
