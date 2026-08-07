using FluentValidation;
using MicroElements.AspNetCore.OpenApi.FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SaloonApi.Modules.Admin.Endpoints;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Booking.BackgroundJobs;
using SaloonApi.Modules.Booking.Endpoints;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Catalog.Endpoints;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Config.Endpoints;
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
using SaloonApi.Shared.Cors;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.ErrorHandling;
using SaloonApi.Shared.Logging;
using SaloonApi.Shared.Observability;
using SaloonApi.Shared.OpenApi;
using SaloonApi.Shared.Realtime;
using SaloonApi.Shared.Security;
using SaloonApi.Shared.Storage;
using Scalar.AspNetCore;
using Serilog;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

StaticLogger.Initialize();

try
{
    Log.Information("Starting SaloonApi web application...");

    var builder = WebApplication.CreateBuilder(args);

    builder.WebHost.ConfigureKestrel(options => options.AddServerHeader = false);

    builder.Host.UseSerilog((_, cfg) =>
    {
        cfg.GetLoggerConfiguration("MainLog");
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
    builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection("Auth"));


    builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
        .Configure<IOptionsMonitor<JwtOptions>>((options, jwtMonitor) =>
        {
            var jwt = jwtMonitor.CurrentValue;
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

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer();

    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("RootSuperAdminOnly", p => p.RequireRole(nameof(UserRole.RootSuperAdmin)));
        options.AddPolicy("ChainManagement", p => p.RequireRole(nameof(UserRole.RootSuperAdmin)));
        options.AddPolicy("ChainDetailsManagement", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin)));
        options.AddPolicy("LocationManagement", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin)));
        options.AddPolicy("LocationDetailsManagement", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager)));
        options.AddPolicy("AdminAccess", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager)));
        options.AddPolicy("StaffAccess", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager), nameof(UserRole.Receptionist), nameof(UserRole.Therapist), nameof(UserRole.Other)));
        options.AddPolicy("CustomerManagement", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin)));
    });

    builder.Services.Configure<CorsOptions>(builder.Configuration.GetSection("Cors"));

    builder.Services.AddCors();
    builder.Services.AddOptions<Microsoft.AspNetCore.Cors.Infrastructure.CorsOptions>()
        .Configure<IOptionsMonitor<CorsOptions>, IOptionsMonitor<PortalUrlOptions>>((options, corsMonitor, portalMonitor) =>
        {
            var configuredOrigins = corsMonitor.CurrentValue.AllowedOrigins ?? [];
            var clientUrl = portalMonitor.CurrentValue.ClientPortalUrl;
            var adminUrl = portalMonitor.CurrentValue.AdminPortalUrl;

            var allOrigins = configuredOrigins
                .Concat([clientUrl, adminUrl])
                .Where(url => !string.IsNullOrWhiteSpace(url))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (allOrigins.Length == 0)
            {
                allOrigins = ["http://localhost:5173", "http://localhost:58569", "http://localhost:58562"];
            }

            options.AddDefaultPolicy(policy => policy
                .WithOrigins(allOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .WithExposedHeaders("Tus-Resumable", "Upload-Offset", "Upload-Length", "Upload-Metadata", "Location"));
        });

    builder.Services.AddTransient<CorrelationIdMiddleware>();
    builder.Services.AddTransient<CurrentUserMiddleware>();
    builder.Services.AddTransient<SecurityHeadersMiddleware>();
    builder.Services.AddScoped<CurrentUser>();
    builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>());

    builder.Services.AddSingleton<SqlConnectionFactory>();

    builder.Services.AddSingleton<IRedisConnectionProvider, RedisConnectionProvider>();
    builder.Services.AddScoped<IAvailabilityCache, RedisAvailabilityCache>();
    builder.Services.AddSingleton<SseBroadcaster>();
    builder.Services.AddSingleton<TokenService>();
    builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
    builder.Services.AddSingleton<IBackgroundEmailQueue, BackgroundEmailQueue>();

    builder.Services.AddScoped<UserRepository>();
    builder.Services.AddScoped<RefreshTokenRepository>();
    builder.Services.AddScoped<PasswordResetTokenRepository>();
    builder.Services.AddScoped<EmailChangeTokenRepository>();
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
    builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));

    builder.Services.AddSingleton<IStorageService>(sp =>
    {
        var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<StorageOptions>>().CurrentValue;
        if (string.Equals(opts.Provider, "S3", StringComparison.OrdinalIgnoreCase))
        {
            return new S3StorageService(sp.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<StorageOptions>>());
        }
        return new LocalStorageService(
            sp.GetRequiredService<IWebHostEnvironment>(),
            sp.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<StorageOptions>>()
        );
    });

    builder.Services.AddHostedService<HoldExpirySweepService>();
    builder.Services.AddHostedService<EmailQueueBackgroundService>();

    builder.Services.AddHealthChecks();
    builder.Services.AddAntiforgery();

    var app = builder.Build();


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

    app.UseMiddleware<SecurityHeadersMiddleware>();

    app.UseHttpsRedirection();
    app.UseCors();
    app.UseAuthentication();
    app.UseMiddleware<CurrentUserMiddleware>(); // after UseAuthentication(): needs context.User's claims populated
    app.UseAuthorization();
    app.UseAntiforgery();
    app.UseTusEndpoints();

    // Polled by both frontends' ConnectivityBanner to distinguish "server is down" from "you're offline"
    // -- no auth, no tags, just a 200 so a plain fetch (no generated client) can hit it from any origin.
    app.MapHealthChecks("/health");

    app.MapAuthEndpoints();
    app.MapConfigEndpoints();
    app.MapCatalogEndpoints();
    app.MapBookingEndpoints();
    app.MapPaymentEndpoints();
    app.MapAdminCatalogEndpoints();
    app.MapAdminStaffEndpoints();
    app.MapAdminBookingEndpoints();
    app.MapAdminCustomersEndpoints();
    app.MapAdminDashboardEndpoints();
    app.MapSchedulingEndpoints();
    app.MapProfileEndpoints();

    await AdminSeeder.SeedRootSuperAdminAsync(app.Services, app.Configuration);

    await app.RunAsync();
}
#pragma warning disable CA1031
catch (Exception ex) when (!ex.GetType().Name.Equals("StopTheHostException", StringComparison.Ordinal))
{
    StaticLogger.Initialize();

    Log.Fatal(ex, "SaloonApi host terminated unexpectedly");
}
#pragma warning restore CA1031
finally
{
    StaticLogger.Initialize();

    Log.Information("SaloonApi host shutdown complete.");

    await Log.CloseAndFlushAsync();
}
