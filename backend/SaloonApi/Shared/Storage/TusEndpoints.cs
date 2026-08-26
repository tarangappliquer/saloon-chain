using System.Net;
using System.Text;
using SaloonApi.Modules.Profile.Infrastructure;
using SaloonApi.Shared.Auth;
using tusdotnet;
using tusdotnet.Interfaces;
using tusdotnet.Models;
using tusdotnet.Models.Configuration;
using tusdotnet.Stores;

namespace SaloonApi.Shared.Storage;

internal static class TusEndpoints
{
    private const long MaxFileBytes = 20 * 1024 * 1024; // 20 MB max file size for resumable uploads

    public static void UseTusEndpoints(this IApplicationBuilder app)
    {
        app.UseTus(httpContext =>
        {
            var env = httpContext.RequestServices.GetRequiredService<IWebHostEnvironment>();
            var tusTempPath = Path.Combine(env.ContentRootPath, "uploads", "tus-temp");
            Directory.CreateDirectory(tusTempPath);

            var storageService = httpContext.RequestServices.GetRequiredService<IStorageService>();
            var currentUser = httpContext.RequestServices.GetRequiredService<ICurrentUser>();
            var profileRepo = httpContext.RequestServices.GetRequiredService<ProfileRepository>();

            return Task.FromResult(new DefaultTusConfiguration
            {
                Store = new TusDiskStore(tusTempPath),
                UrlPath = "/api/files/tus",
                Events = new Events
                {
                    OnAuthorizeAsync = ctx =>
                    {
                        if (currentUser.UserId is null)
                        {
                            ctx.FailRequest(HttpStatusCode.Unauthorized, "Authorization required for upload.");
                        }
                        if (currentUser.EmulatedByUserId is not null)
                        {
                            ctx.FailRequest(HttpStatusCode.Forbidden, "Uploads are not allowed during an emulation session.");
                        }
                        return Task.CompletedTask;
                    },
                    OnBeforeCreateAsync = ctx =>
                    {
                        if (ctx.UploadLength > MaxFileBytes)
                        {
                            ctx.FailRequest(HttpStatusCode.BadRequest, $"File size exceeds max limit of {MaxFileBytes / (1024 * 1024)} MB.");
                        }

                        var category = GetMetadataValue(ctx.Metadata, "category");
                        if (string.Equals(category, "profile-photos", StringComparison.OrdinalIgnoreCase))
                        {
                            var filename = GetMetadataValue(ctx.Metadata, "filename");
                            var ext = Path.GetExtension(filename ?? string.Empty).ToUpperInvariant();
                            if (string.IsNullOrEmpty(ext) || (ext != ".JPG" && ext != ".JPEG" && ext != ".PNG" && ext != ".WEBP"))
                            {
                                ctx.FailRequest(HttpStatusCode.BadRequest, "Only JPG, PNG, or WEBP images are allowed for profile photos.");
                            }
                        }
                        return Task.CompletedTask;
                    },
                    OnFileCompleteAsync = async ctx =>
                    {
                        var file = await ctx.GetFileAsync();
                        var metadata = await file.GetMetadataAsync(ctx.CancellationToken);

                        string originalFileName = GetMetadataValue(metadata, "filename") ?? $"{Guid.NewGuid():N}.bin";
                        string category = GetMetadataValue(metadata, "category") ?? "general";
                        string contentType = GetMetadataValue(metadata, "filetype") ?? "application/octet-stream";
                        string ext = Path.GetExtension(originalFileName);

                        string fileName = originalFileName;
                        if (string.Equals(category, "profile-photos", StringComparison.OrdinalIgnoreCase) && currentUser.UserId.HasValue)
                        {
                            var userId = currentUser.UserId.Value;
                            fileName = $"{userId}{ext}";
                            // Clear previous profile photo
                            await storageService.DeleteFilesAsync("profile-photos", userId.ToString(System.Globalization.CultureInfo.InvariantCulture));
                        }

                        string photoPath;
                        await using (var stream = await file.GetContentAsync(ctx.CancellationToken))
                        {
                            photoPath = await storageService.SaveFileAsync(stream, category, fileName, contentType, ctx.CancellationToken);
                        }

                        if (string.Equals(category, "profile-photos", StringComparison.OrdinalIgnoreCase) && currentUser.UserId.HasValue)
                        {
                            var userId = currentUser.UserId.Value;
                            if (currentUser.Role == UserRole.Customer)
                            {
                                await profileRepo.SetCustomerPhotoPathAsync(userId, photoPath);
                            }
                            else
                            {
                                await profileRepo.SetStaffPhotoPathAsync(userId, photoPath);
                            }
                        }

                        var terminationStore = (ITusTerminationStore)ctx.Store;
                        await terminationStore.DeleteFileAsync(ctx.FileId, ctx.CancellationToken);
                    }
                }
            });
        });
    }

    private static string? GetMetadataValue(Dictionary<string, Metadata> metadata, string key)
    {
        if (metadata.TryGetValue(key, out var meta))
        {
            return meta.GetString(Encoding.UTF8);
        }
        return null;
    }
}
