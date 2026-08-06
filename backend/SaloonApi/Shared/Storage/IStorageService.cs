namespace SaloonApi.Shared.Storage;

internal interface IStorageService
{
    Task<string> SaveFileAsync(Stream stream, string category, string fileName, string contentType, CancellationToken ct = default);
    Task DeleteFilesAsync(string category, string prefixPattern, CancellationToken ct = default);
}
