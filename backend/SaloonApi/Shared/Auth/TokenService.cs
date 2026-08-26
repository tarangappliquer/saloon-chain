using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace SaloonApi.Shared.Auth;

internal sealed class TokenService(IOptionsMonitor<JwtOptions> options)
{
    public const string ChainIdClaimType = "chainId";
    public const string LocationIdClaimType = "locationId";
    public const string TherapistIdClaimType = "therapistId";
    public const string EmulatedByClaimType = "emulatedBy";

    private JwtOptions _options => options.CurrentValue;

    public string CreateToken(
        int userId, string email, UserRole role, int? chainId = null, int? locationId = null,
        int? therapistId = null, int? emulatedByUserId = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString(CultureInfo.InvariantCulture)),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, role.ToString())
        };
        if (chainId is not null) claims.Add(new Claim(ChainIdClaimType, chainId.Value.ToString(CultureInfo.InvariantCulture)));
        if (locationId is not null) claims.Add(new Claim(LocationIdClaimType, locationId.Value.ToString(CultureInfo.InvariantCulture)));
        if (therapistId is not null) claims.Add(new Claim(TherapistIdClaimType, therapistId.Value.ToString(CultureInfo.InvariantCulture)));
        // Set only on tokens minted by /api/auth/emulate -- carries the acting staff member's id
        // through to CurrentUser.EmulatedByUserId so downstream code/logging can tell a real
        // customer session from an admin-on-behalf-of one, without changing Role/UserId itself.
        if (emulatedByUserId is not null) claims.Add(new Claim(EmulatedByClaimType, emulatedByUserId.Value.ToString(CultureInfo.InvariantCulture)));

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_options.ExpiryMinutes),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public DateTime RefreshTokenExpiry => DateTime.UtcNow.AddDays(_options.RefreshTokenExpiryDays);

    // Opaque (not a JWT) -- only ever looked up by its hash, never decoded, so it carries no claims
    // of its own. 32 random bytes is well above the entropy needed to make guessing infeasible.
    public static string GenerateRefreshToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    // Only the hash is persisted (see RefreshTokens) -- so a DB read alone can never be
    // replayed as a live credential.
    public static byte[] HashRefreshToken(string token) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(token));
}
