using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Npgsql;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Email.TemplateModels;

namespace SaloonApi.Shared.ErrorHandling;

internal sealed class DeveloperErrorNotifier(
    IEmailSender emailSender,
    IEmailBodyBuilder bodyBuilder,
    IOptionsMonitor<EmailOptions> emailOptions,
    ILogger<DeveloperErrorNotifier> logger) : IDeveloperErrorNotifier
{
    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Email notification failure must not throw and crash background hosted services.")]
    public async Task NotifyAsync(Exception exception, string contextName, HttpContext? httpContext = null, CancellationToken ct = default)
    {
        try
        {
            var devEmail = emailOptions.CurrentValue.DeveloperEmail;
            if (string.IsNullOrWhiteSpace(devEmail))
                return;

            var timestamp = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            var subject = string.Create(CultureInfo.InvariantCulture, $"🚨 [SaloonApi Alert] Error in {contextName}");

            string? fullUrl = null;
            string? queryParams = null;
            string? requestBody = null;

            if (httpContext is not null)
            {
                var req = httpContext.Request;
                fullUrl = string.Create(CultureInfo.InvariantCulture, $"{req.Scheme}://{req.Host}{req.Path}{req.QueryString}");
                queryParams = req.QueryString.HasValue ? req.QueryString.Value : "(none)";
                requestBody = await ReadRequestBodyAsync(httpContext, ct).ConfigureAwait(false);
            }

            var exceptionDetails = FormatEntireErrorObject(exception);

            var model = new DeveloperErrorNotificationModel
            {
                ContextName = contextName,
                Timestamp = timestamp,
                Method = httpContext?.Request.Method,
                Path = httpContext?.Request.Path.Value,
                FullUrl = fullUrl,
                TraceId = httpContext?.TraceIdentifier,
                QueryParams = queryParams,
                RequestBody = requestBody,
                ExceptionDetails = exceptionDetails
            };

            var htmlBody = await bodyBuilder.BuildDeveloperErrorAlertAsync(model, ct).ConfigureAwait(false);

            var emailMessage = new EmailMessage(
                To: [new EmailAddress(devEmail, "Backend Developer")],
                Subject: subject,
                HtmlBody: htmlBody);

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(2));
            await emailSender.SendAsync(emailMessage, timeoutCts.Token).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to send developer error alert email for {Context}.", contextName);
        }
    }

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Body reading stream failure should return safe fallback message.")]
    private static async Task<string> ReadRequestBodyAsync(HttpContext httpContext, CancellationToken ct)
    {
        try
        {
            var req = httpContext.Request;
            if (req.ContentLength is null or 0)
                return "(empty)";

            req.EnableBuffering();
            if (req.Body.CanSeek)
            {
                req.Body.Position = 0;
            }

            using var reader = new StreamReader(req.Body, Encoding.UTF8, leaveOpen: true);
            var bodyText = await reader.ReadToEndAsync(ct).ConfigureAwait(false);

            if (req.Body.CanSeek)
            {
                req.Body.Position = 0;
            }

            if (string.IsNullOrWhiteSpace(bodyText))
                return "(empty)";

            return MaskSensitiveBodyJson(bodyText);
        }
        catch
        {
            return "(unable to read request body)";
        }
    }

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Regex failure should safely return original json.")]
    private static string MaskSensitiveBodyJson(string json)
    {
        try
        {
            return Regex.Replace(
                json,
                @"(""(?:password|secret|token|signingkey|accesskey)""\s*:\s*"")[^""]*("")",
                "$1***REDACTED***$2",
                RegexOptions.IgnoreCase,
                TimeSpan.FromMilliseconds(250));
        }
        catch
        {
            return json;
        }
    }

    private static string FormatEntireErrorObject(Exception exception)
    {
        var sb = new StringBuilder();
        sb.AppendLine(CultureInfo.InvariantCulture, $"Exception Type: {exception.GetType().FullName}");
        sb.AppendLine(CultureInfo.InvariantCulture, $"Message: {exception.Message}");
        sb.AppendLine(CultureInfo.InvariantCulture, $"Source: {exception.Source}");
        sb.AppendLine(CultureInfo.InvariantCulture, $"HResult: {exception.HResult}");

        if (exception.Data.Count > 0)
        {
            sb.AppendLine("Data Entries:");
            foreach (System.Collections.DictionaryEntry entry in exception.Data)
            {
                sb.AppendLine(CultureInfo.InvariantCulture, $"  - {entry.Key}: {entry.Value}");
            }
        }

        if (exception is PostgresException pgEx)
        {
            sb.AppendLine(CultureInfo.InvariantCulture, $"SqlState: {pgEx.SqlState}");
            sb.AppendLine(CultureInfo.InvariantCulture, $"Severity: {pgEx.Severity}");
            sb.AppendLine(CultureInfo.InvariantCulture, $"Routine: {pgEx.Routine}");
            sb.AppendLine(CultureInfo.InvariantCulture, $"Detail: {pgEx.Detail}");
            sb.AppendLine(CultureInfo.InvariantCulture, $"Hint: {pgEx.Hint}");
        }

        sb.AppendLine("Full Stack Trace / Exception Details:");
        sb.AppendLine(exception.ToString());

        return sb.ToString();
    }
}
