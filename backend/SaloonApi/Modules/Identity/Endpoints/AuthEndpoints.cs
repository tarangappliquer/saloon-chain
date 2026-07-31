using Microsoft.Data.SqlClient;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Identity.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/register", async (RegisterRequest req, AuthService auth) =>
        {
            try
            {
                var (id, token) = await auth.RegisterAsync(req.Name, req.Email, req.Password, req.Phone);
                return Results.Ok(new AuthResponse(id, req.Name, req.Email, token));
            }
            catch (SqlException ex) when (ex.IsApplicationError())
            {
                return Results.Conflict(new { message = ex.Message });
            }
        });

        group.MapPost("/login", async (LoginRequest req, AuthService auth) =>
        {
            var result = await auth.LoginAsync(req.Email, req.Password);
            return result is null
                ? Results.Unauthorized()
                : Results.Ok(new AuthResponse(result.Value.Id, result.Value.Name, req.Email, result.Value.Token));
        });
    }
}

public sealed record RegisterRequest(string Name, string Email, string Password, string? Phone);
public sealed record LoginRequest(string Email, string Password);
public sealed record AuthResponse(int CustomerId, string Name, string Email, string Token);
