using FluentValidation;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Identity.Endpoints;

internal static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/register", async (RegisterRequest req, AuthService auth) =>
        {
            var (id, token) = await auth.RegisterAsync(req.Name, req.Email, req.Password, req.Phone);
            return Results.Ok(new AuthResponse(id, req.Name, req.Email, token));
        }).WithValidation<RegisterRequest>();

        group.MapPost("/login", async (LoginRequest req, AuthService auth) =>
        {
            var result = await auth.LoginAsync(req.Email, req.Password);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(new AuthResponse(result.Value.Id, result.Value.Name, req.Email, result.Value.Token));
        }).WithValidation<LoginRequest>();
    }
}

internal sealed record RegisterRequest(string Name, string Email, string Password, string? Phone);
internal sealed record LoginRequest(string Email, string Password);
internal sealed record AuthResponse(int CustomerId, string Name, string Email, string Token);

internal sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}

internal sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}
