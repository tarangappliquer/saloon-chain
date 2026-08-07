using Microsoft.Extensions.Options;

namespace SaloonApi.Shared.Storage;

internal sealed class LocalStorageService(IWebHostEnvironment env, IOptionsMonitor<StorageOptions> options) : IStorageService
{
    private string BasePath => options.CurrentValue.BasePath;

    public async Task<string> SaveFileAsync(Stream stream, string category, string fileName, string contentType, CancellationToken ct = default)
    {
        var categoryDir = Path.Combine(env.ContentRootPath, BasePath, category);
        Directory.CreateDirectory(categoryDir);

        var fullPath = Path.Combine(categoryDir, fileName);
        await using var fileStream = File.Create(fullPath);
        await stream.CopyToAsync(fileStream, ct);

        return $"/{BasePath}/{category}/{fileName}";
    }

    public Task DeleteFilesAsync(string category, string prefixPattern, CancellationToken ct = default)
    {
        var categoryDir = Path.Combine(env.ContentRootPath, BasePath, category);
        if (Directory.Exists(categoryDir))
        {
            foreach (var existing in Directory.GetFiles(categoryDir, $"{prefixPattern}.*"))
            {
                File.Delete(existing);
            }
        }
        return Task.CompletedTask;
    }
}
