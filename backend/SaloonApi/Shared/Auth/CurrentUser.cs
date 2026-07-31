namespace SaloonApi.Shared.Auth;

// Mutable concrete type -- CurrentUserMiddleware writes to this; everything else reads it
// through ICurrentUser. Registered scoped, both the interface and the concrete type resolve to
// the same instance within a request (see Program.cs).
internal sealed class CurrentUser : ICurrentUser
{
    public int? UserId { get; set; }
    public string? Email { get; set; }
    public UserRole? Role { get; set; }
    public int? ChainId { get; set; }
    public int? LocationId { get; set; }
    public int? TherapistId { get; set; }
    public int? EmulatedByUserId { get; set; }
    public bool IsAuthenticated { get; set; }

    public int RequireUserId() =>
        UserId ?? throw new InvalidOperationException("No authenticated user on the current request.");

    public bool IsInRole(params UserRole[] roles) => Role is { } role && roles.Contains(role);
}
