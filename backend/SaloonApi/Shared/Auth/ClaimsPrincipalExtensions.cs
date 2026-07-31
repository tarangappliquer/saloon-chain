using System.Globalization;
using System.Security.Claims;

namespace SaloonApi.Shared.Auth;

internal static class ClaimsPrincipalExtensions
{
    public static int GetCustomerId(this ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!, CultureInfo.InvariantCulture);
}
