using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace SaloonApi.Shared.Storage;

internal sealed class S3StorageService : IStorageService, IDisposable
{
    private readonly AmazonS3Client _s3Client;
    private readonly IOptionsMonitor<StorageOptions> _optionsMonitor;

    public S3StorageService(IOptionsMonitor<StorageOptions> options)
    {
        _optionsMonitor = options;
        var opts = _optionsMonitor.CurrentValue.S3;

        var config = new AmazonS3Config();
        if (!string.IsNullOrWhiteSpace(opts.ServiceUrl))
        {
            config.ServiceURL = opts.ServiceUrl;
            config.ForcePathStyle = true;
        }
        else if (!string.IsNullOrWhiteSpace(opts.Region))
        {
            config.RegionEndpoint = RegionEndpoint.GetBySystemName(opts.Region);
        }

        _s3Client = new AmazonS3Client(opts.AccessKey, opts.SecretKey, config);
    }

    private S3Options _options => _optionsMonitor.CurrentValue.S3;

    public async Task<string> SaveFileAsync(Stream stream, string category, string fileName, string contentType, CancellationToken ct = default)
    {
        var objectKey = $"{category}/{fileName}";

        var request = new PutObjectRequest
        {
            BucketName = _options.BucketName,
            Key = objectKey,
            InputStream = stream,
            ContentType = contentType
        };

        if (_options.UsePublicReadACL)
        {
            request.CannedACL = S3CannedACL.PublicRead;
        }

        await _s3Client.PutObjectAsync(request, ct);

        if (!string.IsNullOrWhiteSpace(_options.PublicUrlPrefix))
        {
            return $"{_options.PublicUrlPrefix.TrimEnd('/')}/{objectKey}";
        }

        return $"https://{_options.BucketName}.s3.amazonaws.com/{objectKey}";
    }

    public async Task DeleteFilesAsync(string category, string prefixPattern, CancellationToken ct = default)
    {
        var prefix = $"{category}/{prefixPattern}";

        var listRequest = new ListObjectsV2Request
        {
            BucketName = _options.BucketName,
            Prefix = prefix
        };

        var listResponse = await _s3Client.ListObjectsV2Async(listRequest, ct);

        if (listResponse.S3Objects.Count > 0)
        {
            var deleteRequest = new DeleteObjectsRequest
            {
                BucketName = _options.BucketName,
                Objects = listResponse.S3Objects.Select(o => new KeyVersion { Key = o.Key }).ToList()
            };

            await _s3Client.DeleteObjectsAsync(deleteRequest, ct);
        }
    }

    public void Dispose()
    {
        _s3Client.Dispose();
    }
}
