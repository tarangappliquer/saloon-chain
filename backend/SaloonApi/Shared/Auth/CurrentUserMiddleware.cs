using System.Globalization;
using System.Security.Claims;

namespace SaloonApi.Shared.Auth;

// Must run after app.UseAuthentication() -- context.User's claims aren't populated before that.
// Reads them once per request into the scoped CurrentUser, rather than every consumer re-parsing
// ClaimTypes.NameIdentifier itself (that used to live in ClaimsPrincipalExtensions.GetCustomerId(),
// called directly from endpoint handlers -- this replaces it).
internal sealed class CurrentUserMiddleware(CurrentUser currentUser) : IMiddleware
{
    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            currentUser.IsAuthenticated = true;
            currentUser.Email = user.FindFirstValue(ClaimTypes.Email);

            var idClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (idClaim is not null && int.TryParse(idClaim, NumberStyles.Integer, CultureInfo.InvariantCulture, out var customerId))
                currentUser.CustomerId = customerId;
        }

        await next(context);
    }
}
