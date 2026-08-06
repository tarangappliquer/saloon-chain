namespace SaloonApi.Shared.Storage;

internal sealed class StorageOptions
{
    public string Provider { get; set; } = "Local"; // "Local" or "S3"
    public string BasePath { get; set; } = "uploads";
    public S3Options S3 { get; set; } = new();
}

internal sealed class S3Options
{
    public string BucketName { get; set; } = string.Empty;
    public string AccessKey { get; set; } = string.Empty;
    public string SecretKey { get; set; } = string.Empty;
    public string Region { get; set; } = "us-east-1";
    public string? ServiceUrl { get; set; }
    public string? PublicUrlPrefix { get; set; }
    public bool UsePublicReadACL { get; set; }
}
