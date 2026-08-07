using Microsoft.Extensions.Options;
using SaloonApi.Shared.Auth;

namespace SaloonApi.Modules.Config.Endpoints;

internal static class ConfigEndpoints
{
    public static void MapConfigEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/config").WithTags("Config");

        // Each portal gets only the URL(s) it actually needs, not the whole PortalUrlOptions --
        // adminportal links out to clientportal (customer emulation handoff), clientportal links
        // back to adminportal ("exit emulation" redirect). Public, no [Authorize]: needed before
        // login to build those cross-portal links, and neither value is sensitive.
        group.MapGet("/adminportal", (IOptionsMonitor<PortalUrlOptions> portalUrls) =>
            Results.Ok(new AdminPortalConfigResponse(portalUrls.CurrentValue.ClientPortalUrl)))
          .Produces<AdminPortalConfigResponse>()
          .WithDescription("Config the adminportal needs at startup (clientportal base URL).");

        group.MapGet("/clientportal", (IOptionsMonitor<PortalUrlOptions> portalUrls) =>
            Results.Ok(new ClientPortalConfigResponse(portalUrls.CurrentValue.AdminPortalUrl)))
          .Produces<ClientPortalConfigResponse>()
          .WithDescription("Config the clientportal needs at startup (adminportal base URL).");
    }
}

internal sealed record AdminPortalConfigResponse(string ClientPortalUrl);
internal sealed record ClientPortalConfigResponse(string AdminPortalUrl);
