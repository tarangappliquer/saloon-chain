namespace SaloonApi.Shared.Auth;

// Request-scoped view of the caller, populated once by CurrentUserMiddleware from the JWT claims.
// Inject this instead of ClaimsPrincipal/HttpContext -- keeps services (not just endpoint
// handlers) able to know who's calling without depending on ASP.NET Core request types.
internal interface ICurrentUser
{
    int? CustomerId { get; }
    string? Email { get; }
    bool IsAuthenticated { get; }

    // Throws if called on a request with no authenticated customer -- only call this from code
    // that only ever runs behind [Authorize]/.RequireAuthorization().
    int RequireCustomerId();
}
