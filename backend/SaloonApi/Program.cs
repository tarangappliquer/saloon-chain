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
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Modules.Payment.Endpoints;
using SaloonApi.Modules.Payment.Infrastructure;
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

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

builder.Services.AddValidatorsFromAssemblyContaining<Program>(includeInternalTypes: true);
builder.Services.AddFluentValidationRulesToOpenApi();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<AppExceptionHandler>();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
builder.Services.Configure<PortalUrlOptions>(builder.Configuration.GetSection("Portals"));
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
    // Broad-to-narrow: RootSuperAdmin is the platform owner (no scope at all), SuperAdmin/Admin are
    // scoped to one chain (ICurrentUser.ChainId), Manager/Receptionist/Therapist/Other to one
    // location (ICurrentUser.LocationId) -- see dbo.Users in 01_tables.sql. These policies gate
    // *which endpoints* a role may call; per-record chain/location scoping is left to the endpoint/
    // repository layer to check against ICurrentUser where it matters.
    options.AddPolicy("RootSuperAdminOnly", p => p.RequireRole(nameof(UserRole.RootSuperAdmin)));
    // Chains are the tenant boundary -- create/activate/delete, and creating a chain's first
    // SuperAdmin/Admin, is RootSuperAdmin's alone (a chain's own SuperAdmin doesn't get to create
    // more chains). Not exposed in the admin portal (single-saloon product decision) but kept
    // enforced here so re-enabling multi-chain later is a frontend change, not a backend one.
    // Layered on top of a route's existing AdminAccess requirement (see AdminCatalogEndpoints'
    // chains routes), not a replacement for it -- ASP.NET Core ANDs multiple RequireAuthorization
    // policies together, so the net effect of AdminAccess + ChainManagement is RootSuperAdmin only
    // (RootSuperAdmin must therefore also be in AdminAccess below, or the AND never passes).
    options.AddPolicy("ChainManagement", p => p.RequireRole(nameof(UserRole.RootSuperAdmin)));
    // A chain's own SuperAdmin may see and edit *their* chain's details (name/active state) -- just
    // not create or delete chains, which stays RootSuperAdmin-only via ChainManagement above. Scoping
    // to the caller's own chain is checked in AdminCatalogEndpoints' PUT /chains/{id} handler, same
    // layering trick as ChainManagement.
    options.AddPolicy("ChainDetailsManagement", p => p.RequireRole(
        nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin)));
    // Locations/Rooms are SuperAdmin/Admin's remit (within their own chain, see AdminCatalogEndpoints'
    // ChainId checks), not Manager's/Receptionist's (they run one location day to day, not a creator
    // of them) -- RootSuperAdmin can do it too, for any chain, same layering trick as ChainManagement above.
    options.AddPolicy("LocationManagement", p => p.RequireRole(
        nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin)));
    // A location's own Manager may edit *their* location's details -- not create/delete locations,
    // which stays LocationManagement's remit above. Scoping to the caller's own location is checked
    // in AdminCatalogEndpoints' PUT /locations/{id} handler.
    options.AddPolicy("LocationDetailsManagement", p => p.RequireRole(
        nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager)));
    options.AddPolicy("AdminAccess", p => p.RequireRole(
        nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager)));
    options.AddPolicy("StaffAccess", p => p.RequireRole(
        nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager), nameof(UserRole.Receptionist), nameof(UserRole.Therapist), nameof(UserRole.Other)));
    // Creating a customer account is RootSuperAdmin/SuperAdmin/Admin's remit, not Manager's -- edit/
    // delete/view stay under the Admin Customers group's own AdminAccess (Manager included there).
    // Layered on top of that group requirement, same trick as ChainManagement/LocationManagement above.
    options.AddPolicy("CustomerManagement", p => p.RequireRole(
        nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin)));
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
builder.Services.AddScoped<PasswordResetTokenRepository>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<CatalogRepository>();
builder.Services.AddScoped<BookingRepository>();
builder.Services.AddScoped<BookingService>();
builder.Services.AddScoped<SchedulingRepository>();
builder.Services.AddScoped<ProfileRepository>();
builder.Services.AddScoped<IPaymentGateway, StripePaymentGateway>();
builder.Services.AddScoped<IPaymentGateway, CashPaymentGateway>();
builder.Services.AddScoped<IPaymentGateway, InHousePaymentGateway>();
builder.Services.AddScoped<IPaymentGatewayFactory, PaymentGatewayFactory>();
builder.Services.AddScoped<PaymentRepository>();
builder.Services.AddScoped<StripeCustomerService>();
builder.Services.AddScoped<PaymentService>();

builder.Services.Configure<StripeOptions>(builder.Configuration.GetSection("Stripe"));

builder.Services.AddHostedService<HoldExpirySweepService>();
builder.Services.AddHostedService<EmailQueueBackgroundService>();

var app = builder.Build();

// Must run first: everything downstream (exception handler, HTTPS redirection, auth) needs the
// scheme/remote-IP already corrected from X-Forwarded-* before it makes any decision on them.
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
forwardedHeadersOptions.KnownIPNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

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
app.MapPaymentEndpoints();
app.MapAdminCatalogEndpoints();
app.MapAdminStaffEndpoints();
app.MapAdminBookingEndpoints();
app.MapAdminCustomersEndpoints();
app.MapSchedulingEndpoints();
app.MapProfileEndpoints();

await AdminSeeder.SeedRootSuperAdminAsync(app.Services, app.Configuration);

await app.RunAsync();
