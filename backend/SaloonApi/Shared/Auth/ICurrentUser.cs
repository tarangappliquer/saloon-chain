namespace SaloonApi.Shared.Auth;

// Request-scoped view of the caller, populated once by CurrentUserMiddleware from the JWT claims.
// Inject this instead of ClaimsPrincipal/HttpContext -- keeps services (not just endpoint
// handlers) able to know who's calling without depending on ASP.NET Core request types.
internal interface ICurrentUser
{
    int? UserId { get; }
    string? Email { get; }
    UserRole? Role { get; }
    int? ChainId { get; }    // set for Role=Admin: the chain they're scoped to
    int? LocationId { get; } // set for Role=Manager/Therapist: the location they're scoped to
    int? TherapistId { get; } // set for Role=Therapist: the Therapists row this login is tied to
    int? EmulatedByUserId { get; } // set when this token came from /api/auth/emulate: the staff user id acting as this customer
    bool IsAuthenticated { get; }

    // Throws if called on a request with no authenticated user -- only call this from code
    // that only ever runs behind [Authorize]/.RequireAuthorization().
    int RequireUserId();

    bool IsInRole(params UserRole[] roles);
}
