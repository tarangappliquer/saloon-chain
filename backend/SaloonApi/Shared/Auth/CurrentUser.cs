namespace SaloonApi.Shared.Auth;

// Mutable concrete type -- CurrentUserMiddleware writes to this; everything else reads it
// through ICurrentUser. Registered scoped, both the interface and the concrete type resolve to
// the same instance within a request (see Program.cs).
internal sealed class CurrentUser : ICurrentUser
{
    public int? CustomerId { get; set; }
    public string? Email { get; set; }
    public bool IsAuthenticated { get; set; }

    public int RequireCustomerId() =>
        CustomerId ?? throw new InvalidOperationException("No authenticated customer on the current request.");
}
