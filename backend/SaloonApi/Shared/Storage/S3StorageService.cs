using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace SaloonApi.Shared.Storage;

internal sealed class S3StorageService : IStorageService, IDisposable
{
    private readonly AmazonS3Client _s3Client;
    private readonly S3Options _options;

    public S3StorageService(IOptions<StorageOptions> options)
    {
        _options = options.Value.S3;

        var config = new AmazonS3Config();
        if (!string.IsNullOrWhiteSpace(_options.ServiceUrl))
        {
            config.ServiceURL = _options.ServiceUrl;
            config.ForcePathStyle = true;
        }
        else if (!string.IsNullOrWhiteSpace(_options.Region))
        {
            config.RegionEndpoint = RegionEndpoint.GetBySystemName(_options.Region);
        }

        _s3Client = new AmazonS3Client(_options.AccessKey, _options.SecretKey, config);
    }

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
