using System.Globalization;
using System.Security.Claims;

namespace SaloonApi.Shared.Auth;

// Must run after app.UseAuthentication() -- context.User's claims aren't populated before that.
// Reads them once per request into the scoped CurrentUser, rather than every consumer re-parsing
// claims itself (that used to live in ClaimsPrincipalExtensions.GetCustomerId(), called directly
// from endpoint handlers -- this replaces it).
internal sealed class CurrentUserMiddleware(CurrentUser currentUser) : IMiddleware
{
    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            currentUser.IsAuthenticated = true;
            currentUser.Email = user.FindFirstValue(ClaimTypes.Email);

            if (TryParseInt(user, ClaimTypes.NameIdentifier, out var userId))
                currentUser.UserId = userId;

            var roleClaim = user.FindFirstValue(ClaimTypes.Role);
            if (roleClaim is not null && Enum.TryParse<UserRole>(roleClaim, out var role))
                currentUser.Role = role;

            if (TryParseInt(user, TokenService.ChainIdClaimType, out var chainId))
                currentUser.ChainId = chainId;
            if (TryParseInt(user, TokenService.LocationIdClaimType, out var locationId))
                currentUser.LocationId = locationId;
            if (TryParseInt(user, TokenService.TherapistIdClaimType, out var therapistId))
                currentUser.TherapistId = therapistId;
            if (TryParseInt(user, TokenService.EmulatedByClaimType, out var emulatedByUserId))
                currentUser.EmulatedByUserId = emulatedByUserId;
        }

        await next(context);
    }

    private static bool TryParseInt(ClaimsPrincipal user, string claimType, out int value)
    {
        var raw = user.FindFirstValue(claimType);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
    }
}
