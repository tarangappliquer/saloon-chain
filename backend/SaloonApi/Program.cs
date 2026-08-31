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
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Identity.Endpoints;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Inventory.Endpoints;
using SaloonApi.Modules.Inventory.Infrastructure;
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Modules.Payment.Endpoints;
using SaloonApi.Modules.Payment.Infrastructure;
using SaloonApi.Modules.Payroll.Endpoints;
using SaloonApi.Modules.Payroll.Infrastructure;
using SaloonApi.Modules.Profile.Endpoints;
using SaloonApi.Modules.Profile.Infrastructure;
using SaloonApi.Modules.Reports.Endpoints;
using SaloonApi.Modules.Reports.Infrastructure;
using SaloonApi.Modules.Review.Endpoints;
using SaloonApi.Modules.Review.Infrastructure;
using SaloonApi.Modules.Scheduling.Endpoints;
using SaloonApi.Modules.Scheduling.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Bootstrap;
using SaloonApi.Shared.Caching;
using SaloonApi.Shared.Cors;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;
using SaloonApi.Shared.Email;
using SaloonApi.Shared.ErrorHandling;
using SaloonApi.Shared.Http;
using SaloonApi.Shared.Json;
using SaloonApi.Shared.Logging;
using SaloonApi.Shared.Observability;
using SaloonApi.Shared.OpenApi;
using SaloonApi.Shared.Realtime;
using SaloonApi.Shared.Security;
using SaloonApi.Shared.Storage;
using Scalar.AspNetCore;
using Serilog;
using System.Text;

StaticLogger.Initialize(StaticLogger.CleanLogsOnStartupFromEnv);

try
{
    Log.Information("Starting SaloonApi web application...");

    // In a CPU-limited container the ThreadPool starts with very few threads and grows only about
    // one per second. Opening an Npgsql connection blocks a pool thread on synchronous name
    // resolution, so when DNS or the database is briefly slow a burst of opens from request load
    // plus the periodic sweeps parks every thread for the connect timeout and starves the pool.
    // The whole API then stops responding and name resolution itself starts failing. Raising the
    // floor lets the pool absorb that burst instead of collapsing.
    ThreadPool.GetMinThreads(out _, out var minIoThreads);
    ThreadPool.SetMinThreads(Math.Max(Environment.ProcessorCount * 8, 64), Math.Max(minIoThreads, 64));

    var builder = WebApplication.CreateBuilder(args);

    builder.WebHost.ConfigureKestrel(options => options.AddServerHeader = false);

    builder.Host.UseSerilog((_, cfg) =>
    {
        cfg.GetLoggerConfiguration(isMainLog: true);
    });

    builder.Services.AddOpenApi(options =>
    {
        options.AddScalarTransformers();
        options.AddDocumentTransformer<BearerSecuritySchemeTransformer>();
        options.AddOperationTransformer<DefaultResponsesOperationTransformer>();

        options.AddFluentValidationRules();
        options.AddSchemaTransformer<LongAsStringSchemaTransformer>();
        options.AddDocumentTransformer<OpenApi30NormalizeTransformer>();
    });

    builder.Services.ConfigureHttpJsonOptions(options =>
    {
        options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        options.SerializerOptions.Converters.Add(new LongToStringJsonConverterFactory());
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
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin)));
        options.AddPolicy("LocationManagement", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin)));
        options.AddPolicy("LocationDetailsManagement", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager)));
        options.AddPolicy("AdminAccess", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager)));
        options.AddPolicy("StaffAccess", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager), nameof(UserRole.Receptionist), nameof(UserRole.Therapist), nameof(UserRole.Other)));
        // Includes Manager/Receptionist (not just Admin+) so front-desk POS checkout can create a
        // walk-in's customer record on the spot, same as Fresha's front-desk quick-add.
        options.AddPolicy("CustomerManagement", p => p.RequireRole(
            nameof(UserRole.RootSuperAdmin), nameof(UserRole.SuperAdmin), nameof(UserRole.Admin), nameof(UserRole.Manager), nameof(UserRole.Receptionist)));
    });

    builder.Services.Configure<CorsOptions>(builder.Configuration.GetSection("Cors"));

    builder.Services.AddCors();
    builder.Services.AddOptions<Microsoft.AspNetCore.Cors.Infrastructure.CorsOptions>()
        .Configure<IOptionsMonitor<CorsOptions>, IOptionsMonitor<PortalUrlOptions>>((options, corsMonitor, portalMonitor) =>
        {
            var configuredOrigins = corsMonitor.CurrentValue.AllowedOrigins
                .Split([',', ';', ' ', '\t', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
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
    builder.Services.AddTransient<RequestContextMiddleware>();
    builder.Services.AddScoped<CurrentUser>();
    builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>());
    builder.Services.AddScoped<RequestContext>();
    builder.Services.AddScoped<IRequestContext>(sp => sp.GetRequiredService<RequestContext>());

    builder.Services.AddSingleton<StaffDbService>();
    builder.Services.AddSingleton<CatalogDbService>();
    builder.Services.AddSingleton<BookingDbService>();
    builder.Services.AddSingleton<SchedulingDbService>();
    builder.Services.AddSingleton<InventoryDbService>();
    builder.Services.AddSingleton<PayrollDbService>();
    builder.Services.AddSingleton<ReportsDbService>();
    builder.Services.AddSingleton<PaymentDbService>();
    builder.Services.AddSingleton<AdminDbService>();
    builder.Services.AddSingleton<AuthDbService>();
    builder.Services.AddSingleton<ProfileDbService>();
    builder.Services.AddSingleton<ReviewDbService>();
    builder.Services.AddSingleton<EmailOutboxDbService>();

    builder.Services.AddSingleton<SqlConnectionFactory>();

    builder.Services.AddSingleton<IRedisConnectionProvider, RedisConnectionProvider>();
    builder.Services.AddScoped<IAvailabilityCache, RedisAvailabilityCache>();
    builder.Services.AddSingleton<SseBroadcaster>();
    builder.Services.AddSingleton<TokenService>();
    builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
    builder.Services.AddSingleton<IBackgroundEmailQueue, EmailOutboxQueue>();
    builder.Services.AddSingleton<IRazorTemplateEngine, RazorTemplateEngine>();
    builder.Services.AddSingleton<IEmailBodyBuilder, EmailBodyBuilder>();

    builder.Services.AddSingleton<AdminSeeder>();

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
    builder.Services.AddScoped<ReviewRepository>();
    builder.Services.AddScoped<IPaymentGateway, StripePaymentGateway>();
    builder.Services.AddScoped<IPaymentGateway, CashPaymentGateway>();
    builder.Services.AddScoped<IPaymentGateway, InHousePaymentGateway>();
    builder.Services.AddScoped<IPaymentGatewayFactory, PaymentGatewayFactory>();
    builder.Services.AddScoped<PaymentRepository>();
    builder.Services.AddScoped<StripeCustomerService>();
    builder.Services.AddScoped<InventoryRepository>();
    builder.Services.AddScoped<PaymentService>();
    builder.Services.AddScoped<PayrollRepository>();
    builder.Services.AddScoped<ReportsRepository>();

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

    builder.Services.AddSingleton<IDeveloperErrorNotifier, DeveloperErrorNotifier>();

    builder.Services.AddHostedService<HoldExpirySweepService>();
    builder.Services.AddHostedService<EmailQueueBackgroundService>();
    builder.Services.AddHostedService<SaloonApi.Modules.Booking.BackgroundJobs.AvailabilitySyncStartupHostedService>();
    builder.Services.AddHostedService<SaloonApi.Modules.Admin.BackgroundJobs.StaffAttendanceSweepHostedService>();

    builder.Services.AddHealthChecks();
    builder.Services.AddAntiforgery();

    var app = builder.Build();


    var forwardedHeadersOptions = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        ForwardLimit = 1 // only trust one hop: the immediate proxy/ingress
    };
    // ponytail: trusts any single proxy (no KnownProxies/KnownIPNetworks allowlist) since pods
    // aren't reachable except through the cluster ingress/LB. If that stops being true, restrict
    // KnownProxies/KnownIPNetworks to the ingress IP range instead of clearing both.
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
    app.UseMiddleware<RequestContextMiddleware>(); // reads X-Timezone into the scoped RequestContext

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
    app.MapCatalogEndpoints();
    app.MapBookingEndpoints();
    app.MapPaymentEndpoints();
    app.MapAdminCatalogEndpoints();
    app.MapAdminStaffEndpoints();
    app.MapAdminBookingEndpoints();
    app.MapAdminCustomersEndpoints();
    app.MapAdminBlockTypesEndpoints();
    app.MapAdminAppointmentStatusesEndpoints();
    app.MapAdminCancelReasonsEndpoints();
    app.MapAdminDashboardEndpoints();
    app.MapSchedulingEndpoints();
    app.MapProfileEndpoints();
    app.MapReviewEndpoints();
    app.MapInventoryEndpoints();
    app.MapPayrollEndpoints();
    app.MapReportsEndpoints();

    await app.Services.GetRequiredService<AdminSeeder>().SeedRootSuperAdminAsync();

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
