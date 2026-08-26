using Microsoft.Extensions.Options;

namespace SaloonApi.Shared.Storage;

internal sealed class LocalStorageService(IWebHostEnvironment env, IOptionsMonitor<StorageOptions> options) : IStorageService
{
    private string BasePath => options.CurrentValue.BasePath;

    public async Task<string> SaveFileAsync(Stream stream, string category, string fileName, string contentType, CancellationToken ct = default)
    {
        var safeCategory = SanitizeSegment(category);
        var safeFileName = SanitizeSegment(Path.GetFileName(fileName));

        var rootDir = Path.GetFullPath(Path.Combine(env.ContentRootPath, BasePath) + Path.DirectorySeparatorChar);
        var categoryDir = Path.GetFullPath(Path.Combine(rootDir, safeCategory));
        var fullPath = Path.GetFullPath(Path.Combine(categoryDir, safeFileName));
        if (!categoryDir.StartsWith(rootDir, StringComparison.Ordinal) || !fullPath.StartsWith(categoryDir + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new ArgumentException("Invalid category or file name.");
        }

        Directory.CreateDirectory(categoryDir);
        await using var fileStream = File.Create(fullPath);
        await stream.CopyToAsync(fileStream, ct);

        return $"/{BasePath}/{safeCategory}/{safeFileName}";
    }

    public Task DeleteFilesAsync(string category, string prefixPattern, CancellationToken ct = default)
    {
        var safeCategory = SanitizeSegment(category);
        var rootDir = Path.GetFullPath(Path.Combine(env.ContentRootPath, BasePath) + Path.DirectorySeparatorChar);
        var categoryDir = Path.GetFullPath(Path.Combine(rootDir, safeCategory));
        if (!categoryDir.StartsWith(rootDir, StringComparison.Ordinal) || !Directory.Exists(categoryDir))
        {
            return Task.CompletedTask;
        }

        foreach (var existing in Directory.GetFiles(categoryDir, $"{SanitizeSegment(prefixPattern)}.*"))
        {
            File.Delete(existing);
        }
        return Task.CompletedTask;
    }

    // ponytail: strips path separators/traversal so caller-supplied segments can't escape BasePath
    private static string SanitizeSegment(string? segment)
    {
        if (string.IsNullOrWhiteSpace(segment)) return "_";
        var name = segment.Replace("..", string.Empty, StringComparison.OrdinalIgnoreCase);
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(c, '_');
        }
        name = name.Replace('/', '_').Replace('\\', '_');
        return string.IsNullOrEmpty(name) ? "_" : name;
    }
}
