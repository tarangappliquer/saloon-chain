using FluentValidation;
using MicroElements.AspNetCore.OpenApi.FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using SaloonApi.Modules.Admin.Endpoints;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Booking.BackgroundJobs;
using SaloonApi.Modules.Booking.Endpoints;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Catalog.Endpoints;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Identity.Endpoints;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Profile.Endpoints;
using SaloonApi.Modules.Profile.Infrastructure;
using SaloonApi.Modules.Scheduling.Endpoints;
using SaloonApi.Modules.Scheduling.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Bootstrap;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.ErrorHandling;
using SaloonApi.Shared.Observability;
using SaloonApi.Shared.OpenApi;
using SaloonApi.Shared.Realtime;
using Scalar.AspNetCore;
using Serilog;
using Serilog.Formatting.Json;
using StackExchange.Redis;
using System.Globalization;
using System.Text;


var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((_, cfg) =>
{
    var json = new JsonFormatter(renderMessage: true, formatProvider: CultureInfo.InvariantCulture);
    cfg.Enrich.FromLogContext() // required for CorrelationIdMiddleware's LogContext.PushProperty to show up
       .Enrich.WithMachineName()
       .Enrich.WithEnvironmentName()
       .Enrich.WithThreadId()
       .MinimumLevel.Information()
#if DEBUG
       .WriteTo.Console(json)
#endif
       .WriteTo.File(json, "Logs/log-.json", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 31);
});

builder.Services.AddOpenApi(options =>
{
    options.AddScalarTransformers();
    options.AddDocumentTransformer<BearerSecuritySchemeTransformer>();
    options.AddOperationTransformer<DefaultResponsesOperationTransformer>();

    options.AddFluentValidationRules();
});

builder.Services.AddValidatorsFromAssemblyContaining<Program>(includeInternalTypes: true);
builder.Services.AddFluentValidationRulesToOpenApi();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<AppExceptionHandler>();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtOptions>()
    ?? throw new InvalidOperationException("Missing Jwt configuration");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true
        };
    });
builder.Services.AddAuthorization(options =>
{
    // Broad-to-narrow: SuperAdmin sees every chain, Admin is scoped to one chain (ICurrentUser.ChainId),
    // Manager/Therapist to one location (ICurrentUser.LocationId) -- see dbo.Users in 01_tables.sql.
    // These policies gate *which endpoints* a role may call; per-record chain/location scoping is
    // left to the endpoint/repository layer to check against ICurrentUser where it matters.
    options.AddPolicy("SuperAdminOnly", p => p.RequireRole(nameof(UserRole.SuperAdmin)));
    // Chains are the tenant boundary -- create/activate/delete/assign-admin is Super Admin's alone
    // per spec (Admin's remit starts at *locations* within a chain, not the chain record itself).
    // Layered on top of a route's existing AdminAccess requirement (see AdminCatalogEndpoints'
    // chains routes), not a replacement for it -- ASP.NET Core ANDs multiple RequireAuthorization
    // policies together, so the net effect of AdminAccess + ChainManagement is SuperAdmin only.
    options.AddPolicy("ChainManagement", p => p.RequireRole(nameof(UserRole.SuperAdmin)));
    // Locations/Rooms are Admin's remit, not Manager's (Manager is head of one location, not a
    // creator of them) -- same layering trick as ChainManagement above.
    options.AddPolicy("LocationManagement", p => p.RequireRole(nameof(UserRole.SuperAdmin), nameof(UserRole.Admin)));
    options.AddPolicy("AdminAccess", p => p.RequireRole(
        nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager)));
    options.AddPolicy("StaffAccess", p => p.RequireRole(
        nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager), nameof(UserRole.Therapist)));
});

builder.Services.AddCors(options =>
{
    var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
        ?? ["http://localhost:5173"];
    options.AddDefaultPolicy(policy => policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod());
});

builder.Services.AddTransient<CorrelationIdMiddleware>();
builder.Services.AddTransient<CurrentUserMiddleware>();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>());

builder.Services.AddSingleton<SqlConnectionFactory>();
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Redis")!));
builder.Services.AddSingleton<IAvailabilityCache, RedisAvailabilityCache>();
builder.Services.AddSingleton<SseBroadcaster>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddSingleton<IBackgroundEmailQueue, BackgroundEmailQueue>();

builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<RefreshTokenRepository>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<CatalogRepository>();
builder.Services.AddScoped<BookingRepository>();
builder.Services.AddScoped<BookingService>();
builder.Services.AddScoped<SchedulingRepository>();
builder.Services.AddScoped<ProfileRepository>();

builder.Services.AddHostedService<HoldExpirySweepService>();
builder.Services.AddHostedService<EmailQueueBackgroundService>();

var app = builder.Build();

// Must run first: everything downstream (exception handler, HTTPS redirection, auth) needs the
// scheme/remote-IP already corrected from X-Forwarded-* before it makes any decision on them.
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
// Cleared: ASP.NET Core only trusts forwarded headers from a loopback proxy by default. In a
// typical container/cloud deployment the reverse proxy (ingress, sidecar, load balancer) isn't
// loopback and its IP isn't fixed, so the default allowlist would silently ignore it. This trusts
// forwarded headers from *any* immediate caller -- only appropriate because the proxy in front is
// the sole entry point (the app itself is never directly internet-reachable).
forwardedHeadersOptions.KnownIPNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

// Served publicly (no auth) -- profile photos are referenced directly from <img> tags in both
// frontends, which can't attach an Authorization header. Not under wwwroot: this is an API project
// with no other static content, so a dedicated physical provider keeps the upload directory
// separate from (and not implying) a general-purpose static-site root.
var uploadsPath = Path.Combine(builder.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});

app.UseMiddleware<CorrelationIdMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseExceptionHandler();

app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseMiddleware<CurrentUserMiddleware>(); // after UseAuthentication(): needs context.User's claims populated
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapCatalogEndpoints();
app.MapBookingEndpoints();
app.MapAdminCatalogEndpoints();
app.MapAdminStaffEndpoints();
app.MapAdminBookingEndpoints();
app.MapAdminCustomersEndpoints();
app.MapSchedulingEndpoints();
app.MapProfileEndpoints();

await AdminSeeder.SeedSuperAdminAsync(app.Services, app.Configuration);

await app.RunAsync();
