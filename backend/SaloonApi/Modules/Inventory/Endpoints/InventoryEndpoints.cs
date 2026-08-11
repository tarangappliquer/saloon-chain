using FluentValidation;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Inventory.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Inventory.Endpoints;

internal static class InventoryEndpoints
{
    // Suppliers are chain-scoped (see 01_tables.sql) but Manager has no ChainId of their own --
    // resolved from their own location instead, same "derive it, don't ask for it" pattern
    // AdminCatalogEndpoints' /locations/mine uses. RootSuperAdmin must say which chain explicitly.
    private static async Task<(int? ChainId, IResult? Error)> ResolveChainIdAsync(
        ICurrentUser currentUser, int? requestedChainId, CatalogRepository catalogRepo)
    {
        if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin))
            return (currentUser.ChainId, null);

        if (currentUser.IsInRole(UserRole.Manager))
        {
            if (currentUser.LocationId is not { } locationId)
                return (null, Results.Problem("Caller has no location of their own.", statusCode: StatusCodes.Status403Forbidden));
            var location = await catalogRepo.GetLocationByIdForAdminAsync(locationId);
            return location is null
                ? (null, Results.Problem("Location not found.", statusCode: StatusCodes.Status404NotFound))
                : (location.ChainId, null);
        }

        // RootSuperAdmin
        return requestedChainId is { } id
            ? (id, null)
            : (null, Results.Problem("chainId is required.", statusCode: StatusCodes.Status400BadRequest));
    }

    public static void MapInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/inventory").RequireAuthorization("AdminAccess").WithTags("Inventory")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/suppliers", async (int? chainId, ICurrentUser currentUser, InventoryRepository repo, CatalogRepository catalogRepo) =>
        {
            var (resolvedChainId, error) = await ResolveChainIdAsync(currentUser, chainId, catalogRepo);
            if (error is not null) return error;
            return Results.Ok(await repo.GetSuppliersAsync(resolvedChainId!.Value));
        }).Produces<IReadOnlyList<SupplierDto>>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("List a chain's suppliers.");

        group.MapPost("/suppliers", async (SupplierRequest req, ICurrentUser currentUser, InventoryRepository repo, CatalogRepository catalogRepo) =>
        {
            var (resolvedChainId, error) = await ResolveChainIdAsync(currentUser, req.ChainId, catalogRepo);
            if (error is not null) return error;
            return Results.Ok(new IdResponse(await repo.CreateSupplierAsync(resolvedChainId!.Value, req.Name, req.ContactEmail, req.ContactPhone, currentUser.UserId)));
        }).WithValidation<SupplierRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status400BadRequest)
          .WithDescription("Create a new supplier under the caller's chain.");

        group.MapPut("/suppliers/{id:int}", async (int id, SupplierUpdateRequest req, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            await repo.UpdateSupplierAsync(id, req.Name, req.ContactEmail, req.ContactPhone, req.IsActive, currentUser.UserId);
            return Results.NoContent();
        }).WithValidation<SupplierUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .WithDescription("Update a supplier's contact details or active state.");

        group.MapDelete("/suppliers/{id:int}", async (int id, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            await repo.DeleteSupplierAsync(id, currentUser.UserId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Soft-delete a supplier.");

        group.MapGet("/products", async (int locationId, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(await repo.GetProductsAsync(locationId));
        }).Produces<IReadOnlyList<ProductDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's retail products, including inactive ones.");

        group.MapGet("/products/low-stock", async (int locationId, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(await repo.GetLowStockProductsAsync(locationId));
        }).Produces<IReadOnlyList<LowStockProductDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's products at or below their reorder threshold.");

        group.MapPost("/products", async (ProductRequest req, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(new IdResponse(await repo.CreateProductAsync(
                req.LocationId, req.SupplierId, req.Name, req.SKU, req.Price, req.QuantityOnHand, req.ReorderThreshold, currentUser.UserId)));
        }).WithValidation<ProductRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a new retail product under a location, with its starting stock count.");

        group.MapPut("/products/{id:int}", async (int id, ProductUpdateRequest req, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId is { } locationId)
            {
                var mine = await repo.GetProductsAsync(locationId);
                if (!mine.Any(p => p.Id == id))
                    return Results.Problem("Not authorized for this product.", statusCode: StatusCodes.Status403Forbidden);
            }
            await repo.UpdateProductAsync(id, req.SupplierId, req.Name, req.SKU, req.Price, req.ReorderThreshold, req.IsActive, currentUser.UserId);
            return Results.NoContent();
        }).WithValidation<ProductUpdateRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Update a product's details, price, or active state (stock only ever moves via purchase orders or bookings).");

        group.MapDelete("/products/{id:int}", async (int id, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            await repo.DeleteProductAsync(id, currentUser.UserId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .WithDescription("Soft-delete a product.");

        group.MapGet("/purchase-orders", async (int locationId, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            return Results.Ok(await repo.GetPurchaseOrdersAsync(locationId));
        }).Produces<IReadOnlyList<PurchaseOrderDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's purchase orders, newest first.");

        group.MapGet("/purchase-orders/{id:int}", async (int id, InventoryRepository repo) =>
        {
            var detail = await repo.GetPurchaseOrderDetailAsync(id);
            return detail.Header is null ? Results.NotFound() : Results.Ok(detail);
        }).Produces<PurchaseOrderDetailDto>()
          .ProducesProblem(StatusCodes.Status404NotFound)
          .WithDescription("Get a purchase order's header and lines.");

        group.MapPost("/purchase-orders", async (PurchaseOrderRequest req, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && currentUser.LocationId != req.LocationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);
            var lines = req.Lines.Select(l => (l.ProductId, l.Quantity, l.UnitCost)).ToList();
            return Results.Ok(new IdResponse(await repo.CreatePurchaseOrderAsync(req.LocationId, req.SupplierId, lines, currentUser.UserId)));
        }).WithValidation<PurchaseOrderRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Create a purchase order with one or more product lines.");

        // Full receive only (no partial-quantity receiving in v1, see the proc's own comment).
        group.MapPost("/purchase-orders/{id:int}/receive", async (int id, ICurrentUser currentUser, InventoryRepository repo) =>
        {
            await repo.ReceivePurchaseOrderAsync(id, currentUser.UserId);
            return Results.NoContent();
        }).Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Mark a purchase order Received and add its lines' quantities to stock.");
    }
}

internal sealed record IdResponse(int Id);

internal sealed record SupplierRequest(string Name, string? ContactEmail, string? ContactPhone, int? ChainId = null);
internal sealed record SupplierUpdateRequest(string Name, string? ContactEmail, string? ContactPhone, bool IsActive);
internal sealed record ProductRequest(int LocationId, int? SupplierId, string Name, string? SKU, decimal Price, int QuantityOnHand, int ReorderThreshold);
internal sealed record ProductUpdateRequest(int? SupplierId, string Name, string? SKU, decimal Price, int ReorderThreshold, bool IsActive);
internal sealed record PurchaseOrderLineRequest(int ProductId, int Quantity, decimal UnitCost);
internal sealed record PurchaseOrderRequest(int LocationId, int SupplierId, IReadOnlyList<PurchaseOrderLineRequest> Lines);

internal sealed class SupplierRequestValidator : AbstractValidator<SupplierRequest>
{
    public SupplierRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ContactEmail).EmailAddress().When(x => !string.IsNullOrEmpty(x.ContactEmail)).MaximumLength(256);
        RuleFor(x => x.ContactPhone).MaximumLength(30);
    }
}

internal sealed class SupplierUpdateRequestValidator : AbstractValidator<SupplierUpdateRequest>
{
    public SupplierUpdateRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ContactEmail).EmailAddress().When(x => !string.IsNullOrEmpty(x.ContactEmail)).MaximumLength(256);
        RuleFor(x => x.ContactPhone).MaximumLength(30);
    }
}

internal sealed class ProductRequestValidator : AbstractValidator<ProductRequest>
{
    public ProductRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.SKU).MaximumLength(50);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
        RuleFor(x => x.QuantityOnHand).GreaterThanOrEqualTo(0);
        RuleFor(x => x.ReorderThreshold).GreaterThanOrEqualTo(0);
    }
}

internal sealed class ProductUpdateRequestValidator : AbstractValidator<ProductUpdateRequest>
{
    public ProductUpdateRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.SKU).MaximumLength(50);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
        RuleFor(x => x.ReorderThreshold).GreaterThanOrEqualTo(0);
    }
}

internal sealed class PurchaseOrderRequestValidator : AbstractValidator<PurchaseOrderRequest>
{
    public PurchaseOrderRequestValidator()
    {
        RuleFor(x => x.LocationId).GreaterThan(0);
        RuleFor(x => x.SupplierId).GreaterThan(0);
        RuleFor(x => x.Lines).NotEmpty();
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.ProductId).GreaterThan(0);
            line.RuleFor(l => l.Quantity).GreaterThan(0);
            line.RuleFor(l => l.UnitCost).GreaterThanOrEqualTo(0);
        });
    }
}
