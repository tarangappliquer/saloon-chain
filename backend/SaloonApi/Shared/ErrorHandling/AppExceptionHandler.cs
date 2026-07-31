using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using SaloonApi.Shared.Data;

namespace SaloonApi.Shared.ErrorHandling;

// The one place unhandled exceptions land -- endpoints don't catch SqlException themselves.
// Registered via builder.Services.AddExceptionHandler<AppExceptionHandler>() + app.UseExceptionHandler()
// in Program.cs. Runs through IProblemDetailsService so responses stay RFC7807-shaped and pick up
// whatever AddProblemDetails() customization (traceId, etc.) is configured globally.
internal sealed class AppExceptionHandler(IProblemDetailsService problemDetailsService, ILogger<AppExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title) = exception switch
        {
            // sp_*'s THROW 50000-50999: expected application-level rejections (slot taken, hold
            // expired, email already registered, ...) -- safe to surface the proc's own message.
            SqlException sql when sql.IsApplicationError() => (StatusCodes.Status409Conflict, sql.Message),

            // Anything else is a real bug: log it, but never leak internals to the client.
            _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred.")
        };

        if (status == StatusCodes.Status500InternalServerError)
            logger.LogError(exception, "Unhandled exception on {Path}", httpContext.Request.Path);

        httpContext.Response.StatusCode = status;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = title
            }
        });
    }
}
