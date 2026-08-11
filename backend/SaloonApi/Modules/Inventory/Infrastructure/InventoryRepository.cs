using Dapper;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Inventory.Infrastructure;

internal sealed record SupplierDto(int Id, int ChainId, string Name, string? ContactEmail, string? ContactPhone, bool IsActive);
internal sealed record ProductDto(int Id, int LocationId, int? SupplierId, string? SupplierName, string Name, string? SKU, decimal Price, int QuantityOnHand, int ReorderThreshold, bool IsActive);
internal sealed record LowStockProductDto(int Id, string Name, string? SKU, int QuantityOnHand, int ReorderThreshold);
internal sealed record PurchaseOrderDto(int Id, int LocationId, int SupplierId, string SupplierName, string Status, DateTime? ReceivedDate, DateTime CreatedDate, decimal TotalCost);
internal sealed record PurchaseOrderHeaderDto(int Id, int LocationId, int SupplierId, string SupplierName, string Status, DateTime? ReceivedDate, DateTime CreatedDate);
internal sealed record PurchaseOrderLineDto(int Id, int ProductId, string ProductName, int QuantityOrdered, decimal UnitCost);
internal sealed record PurchaseOrderDetailDto(PurchaseOrderHeaderDto? Header, IReadOnlyList<PurchaseOrderLineDto> Lines);
internal sealed record BookingProductDto(int Id, int ProductId, string ProductName, int Quantity, decimal UnitPrice, decimal LineTotal);

internal sealed class InventoryRepository(SqlConnectionFactory factory)
{
    public async Task<int> CreateSupplierAsync(int chainId, string name, string? contactEmail, string? contactPhone, int? createdBy)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int>("dbo.sp_Inventory_CreateSupplier",
            new { ChainId = chainId, Name = name, ContactEmail = contactEmail, ContactPhone = contactPhone, CreatedBy = createdBy });
    }

    public async Task<IReadOnlyList<SupplierDto>> GetSuppliersAsync(int chainId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<SupplierDto>("dbo.sp_Inventory_GetSuppliers", new { ChainId = chainId })).ToList();
    }

    public async Task UpdateSupplierAsync(int id, string name, string? contactEmail, string? contactPhone, bool isActive, int? updatedBy)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Inventory_UpdateSupplier",
            new { Id = id, Name = name, ContactEmail = contactEmail, ContactPhone = contactPhone, IsActive = isActive, UpdatedBy = updatedBy });
    }

    public async Task DeleteSupplierAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Inventory_DeleteSupplier", new { Id = id, UpdatedBy = updatedBy });
    }

    public async Task<int> CreateProductAsync(int locationId, int? supplierId, string name, string? sku, decimal price, int quantityOnHand, int reorderThreshold, int? createdBy)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int>("dbo.sp_Inventory_CreateProduct", new
        {
            LocationId = locationId, SupplierId = supplierId, Name = name, SKU = sku, Price = price,
            QuantityOnHand = quantityOnHand, ReorderThreshold = reorderThreshold, CreatedBy = createdBy,
        });
    }

    public async Task<IReadOnlyList<ProductDto>> GetProductsAsync(int locationId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<ProductDto>("dbo.sp_Inventory_GetProducts", new { LocationId = locationId })).ToList();
    }

    public async Task UpdateProductAsync(int id, int? supplierId, string name, string? sku, decimal price, int reorderThreshold, bool isActive, int? updatedBy)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Inventory_UpdateProduct", new
        {
            Id = id, SupplierId = supplierId, Name = name, SKU = sku, Price = price,
            ReorderThreshold = reorderThreshold, IsActive = isActive, UpdatedBy = updatedBy,
        });
    }

    public async Task DeleteProductAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Inventory_DeleteProduct", new { Id = id, UpdatedBy = updatedBy });
    }

    public async Task<IReadOnlyList<LowStockProductDto>> GetLowStockProductsAsync(int locationId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<LowStockProductDto>("dbo.sp_Inventory_GetLowStockProducts", new { LocationId = locationId })).ToList();
    }

    public async Task<int> CreatePurchaseOrderAsync(int locationId, int supplierId, IReadOnlyList<(int ProductId, int Quantity, decimal UnitCost)> lines, int? createdBy)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@SupplierId", supplierId);
        p.Add("@Lines", lines.AsPurchaseOrderLineList());
        p.Add("@CreatedBy", createdBy);
        p.Add("@Id", dbType: System.Data.DbType.Int32, direction: System.Data.ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Inventory_CreatePurchaseOrder", p);
        return p.Get<int>("@Id");
    }

    public async Task<IReadOnlyList<PurchaseOrderDto>> GetPurchaseOrdersAsync(int locationId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<PurchaseOrderDto>("dbo.sp_Inventory_GetPurchaseOrders", new { LocationId = locationId })).ToList();
    }

    public async Task<PurchaseOrderDetailDto> GetPurchaseOrderDetailAsync(int id)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Inventory_GetPurchaseOrderDetail", new { Id = id });
        var header = await multi.ReadSingleOrDefaultAsync<PurchaseOrderHeaderDto>();
        var lines = (await multi.ReadAsync<PurchaseOrderLineDto>()).ToList();
        return new PurchaseOrderDetailDto(header, lines);
    }

    public async Task ReceivePurchaseOrderAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Inventory_ReceivePurchaseOrder", new { Id = id, UpdatedBy = updatedBy });
    }

    public async Task<int> AddBookingProductAsync(int bookingId, int productId, int quantity, int? createdBy)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@BookingId", bookingId);
        p.Add("@ProductId", productId);
        p.Add("@Quantity", quantity);
        p.Add("@CreatedBy", createdBy);
        p.Add("@Id", dbType: System.Data.DbType.Int32, direction: System.Data.ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Booking_AddProduct", p);
        return p.Get<int>("@Id");
    }

    public async Task RemoveBookingProductAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Booking_RemoveProduct", new { Id = id });
    }

    public async Task<IReadOnlyList<BookingProductDto>> GetBookingProductsAsync(int bookingId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<BookingProductDto>("dbo.sp_Booking_GetProducts", new { BookingId = bookingId })).ToList();
    }
}
