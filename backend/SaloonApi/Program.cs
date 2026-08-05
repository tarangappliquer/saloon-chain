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

try
{
    using var scope = app.Services.CreateScope();
    var factory = scope.ServiceProvider.GetRequiredService<SqlConnectionFactory>();
    using var db = factory.Create();
    await db.OpenAsync();
    using var cmd = db.CreateCommand();
    cmd.CommandText = @"
CREATE OR ALTER PROCEDURE dbo.sp_Catalog_Search
    @Search NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        l.Id, l.ChainId, c.Name AS ChainName, l.Name, l.Address,
        l.OpenTime, l.CloseTime, l.WorkingDaysMask, l.TimeZoneId
    FROM dbo.Locations l
        JOIN dbo.SaloonChains c ON c.Id = l.ChainId
        LEFT JOIN dbo.Treatments t ON t.LocationId = l.Id AND t.IsDelete = 0 AND t.IsActive = 1
        LEFT JOIN dbo.TreatmentCategories tc ON tc.Id = t.TreatmentCategoryId AND tc.IsDelete = 0 AND tc.IsActive = 1
    WHERE l.IsDelete = 0 AND l.IsActive = 1 AND c.IsDelete = 0 AND c.IsActive = 1
        AND (
            @Search IS NULL OR TRIM(@Search) = '' OR
            c.Name LIKE '%' + @Search + '%' OR
            l.Name LIKE '%' + @Search + '%' OR
            l.Address LIKE '%' + @Search + '%' OR
            t.Name LIKE '%' + @Search + '%' OR
            tc.Name LIKE '%' + @Search + '%'
        )
    ORDER BY l.Name;
END;";
    await cmd.ExecuteNonQueryAsync();
}
catch (Microsoft.Data.SqlClient.SqlException ex)
{
    Log.Warning(ex, "Failed to apply sp_Catalog_Search migration on startup");
}

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
