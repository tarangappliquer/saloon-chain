using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Inventory.Infrastructure;

internal sealed record SupplierDto(int Id, int ChainId, string Name, string? ContactEmail, string? ContactPhone, bool IsActive);
internal sealed record ProductDto(int Id, int LocationId, int? SupplierId, string? SupplierName, string Name, string? SKU, decimal Price, int QuantityOnHand, int ReorderThreshold, bool IsActive);
internal sealed record LowStockProductDto(int Id, string Name, string? SKU, int QuantityOnHand, int ReorderThreshold);
internal sealed record PurchaseOrderDto(int Id, int LocationId, int SupplierId, string SupplierName, string Status, DateTime? ReceivedDate, DateTime CreatedDate, decimal TotalCost);
internal sealed record PurchaseOrderHeaderDto(int Id, int LocationId, int SupplierId, string SupplierName, string Status, DateTime? ReceivedDate, DateTime CreatedDate);
internal sealed record PurchaseOrderLineDto(int Id, int ProductId, string ProductName, int QuantityOrdered, decimal UnitCost);
internal sealed record PurchaseOrderDetailDto(PurchaseOrderHeaderDto? Header, IReadOnlyList<PurchaseOrderLineDto> Lines);
internal sealed record BookingProductDto(int Id, int ProductId, string ProductName, int Quantity, decimal UnitPrice, decimal LineTotal);

internal sealed class InventoryRepository(SqlConnectionFactory factory, InventoryDbService inventoryDb, BookingDbService bookingDb)
{
    public async Task<int> CreateSupplierAsync(int chainId, string name, string? contactEmail, string? contactPhone, int? createdBy)
    {
        using var db = factory.Create();
        return await inventoryDb.sp_Inventory_CreateSupplierAsync(db, chainId, name, contactEmail, contactPhone, createdBy);
    }

    public async Task<IReadOnlyList<SupplierDto>> GetSuppliersAsync(int chainId)
    {
        using var db = factory.Create();
        return (await inventoryDb.sp_Inventory_GetSuppliersAsync(db, chainId)).ToList();
    }

    public async Task UpdateSupplierAsync(int id, string name, string? contactEmail, string? contactPhone, bool isActive, int? updatedBy)
    {
        using var db = factory.Create();
        await inventoryDb.sp_Inventory_UpdateSupplierAsync(db, id, name, contactEmail, contactPhone, isActive, updatedBy);
    }

    public async Task DeleteSupplierAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await inventoryDb.sp_Inventory_DeleteSupplierAsync(db, id, updatedBy);
    }

    public async Task<int> CreateProductAsync(int locationId, int? supplierId, string name, string? sku, decimal price, int quantityOnHand, int reorderThreshold, int? createdBy)
    {
        using var db = factory.Create();
        return await inventoryDb.sp_Inventory_CreateProductAsync(db, locationId, supplierId, name, sku, price, quantityOnHand, reorderThreshold, createdBy);
    }

    public async Task<IReadOnlyList<ProductDto>> GetProductsAsync(int locationId)
    {
        using var db = factory.Create();
        return (await inventoryDb.sp_Inventory_GetProductsAsync(db, locationId)).ToList();
    }

    public async Task UpdateProductAsync(int id, int? supplierId, string name, string? sku, decimal price, int reorderThreshold, bool isActive, int? updatedBy)
    {
        using var db = factory.Create();
        await inventoryDb.sp_Inventory_UpdateProductAsync(db, id, supplierId, name, sku, price, reorderThreshold, isActive, updatedBy);
    }

    public async Task DeleteProductAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await inventoryDb.sp_Inventory_DeleteProductAsync(db, id, updatedBy);
    }

    public async Task<IReadOnlyList<LowStockProductDto>> GetLowStockProductsAsync(int locationId)
    {
        using var db = factory.Create();
        return (await inventoryDb.sp_Inventory_GetLowStockProductsAsync(db, locationId)).ToList();
    }

    public async Task<int> CreatePurchaseOrderAsync(int locationId, int supplierId, IReadOnlyList<(int ProductId, int Quantity, decimal UnitCost)> lines, int? createdBy)
    {
        using var db = factory.Create();
        return await inventoryDb.sp_Inventory_CreatePurchaseOrderAsync(db, locationId, supplierId, lines.AsPurchaseOrderLineList(), createdBy);
    }

    public async Task<IReadOnlyList<PurchaseOrderDto>> GetPurchaseOrdersAsync(int locationId)
    {
        using var db = factory.Create();
        return (await inventoryDb.sp_Inventory_GetPurchaseOrdersAsync(db, locationId)).ToList();
    }

    public async Task<PurchaseOrderDetailDto> GetPurchaseOrderDetailAsync(int id)
    {
        using var db = factory.Create();
        using var multi = await inventoryDb.sp_Inventory_GetPurchaseOrderDetailAsync(db, id);
        var header = await multi.ReadSingleOrDefaultAsync<PurchaseOrderHeaderDto>();
        var lines = (await multi.ReadAsync<PurchaseOrderLineDto>()).ToList();
        return new PurchaseOrderDetailDto(header, lines);
    }

    public async Task ReceivePurchaseOrderAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await inventoryDb.sp_Inventory_ReceivePurchaseOrderAsync(db, id, updatedBy);
    }

    public async Task<int> AddBookingProductAsync(int bookingId, int productId, int quantity, int? createdBy)
    {
        using var db = factory.Create();
        return await bookingDb.sp_Booking_AddProductAsync(db, bookingId, productId, quantity, createdBy);
    }

    public async Task RemoveBookingProductAsync(int id)
    {
        using var db = factory.Create();
        await bookingDb.sp_Booking_RemoveProductAsync(db, id);
    }

    public async Task<IReadOnlyList<BookingProductDto>> GetBookingProductsAsync(int bookingId)
    {
        using var db = factory.Create();
        return (await inventoryDb.sp_Booking_GetProductsAsync(db, bookingId)).ToList();
    }
}
