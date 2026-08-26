using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.Email.TemplateModels;

namespace SaloonApi.Tests;

public class EmailTemplateRenderingTests
{
    [Fact]
    public async Task RenderDeveloperErrorAlertModelSuccessfullyRendersHtml()
    {
        var env = Substitute.For<IWebHostEnvironment>();
        var contentRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "SaloonApi"));
        env.ContentRootPath.Returns(contentRoot);

        var logger = NullLogger<RazorTemplateEngine>.Instance;
        var engine = new RazorTemplateEngine(env, logger);
        var builder = new EmailBodyBuilder(engine);

        var model = new DeveloperErrorNotificationModel
        {
            ContextName = "HoldExpirySweepService",
            Timestamp = "2026-08-26T17:46:37.3684536+05:30",
            Method = "POST",
            Path = "/api/test",
            FullUrl = "http://localhost:5127/api/test",
            TraceId = "0HMV89",
            QueryParams = "foo=bar",
            RequestBody = "{}",
            ExceptionDetails = "System.InvalidOperationException: Test error"
        };

        var html = await builder.BuildDeveloperErrorAlertAsync(model, TestContext.Current.CancellationToken);

        Assert.NotNull(html);
        Assert.Contains("HoldExpirySweepService", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("System.InvalidOperationException: Test error", html, StringComparison.OrdinalIgnoreCase);
    }
}
