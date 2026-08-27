using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Inventory.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class InventoryDbService
{
    public Task<int> sp_Inventory_CreateSupplierAsync(IDbConnection db, int chainId, string name, string? contactEmail, string? contactPhone, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("ContactEmail", contactEmail, DbType.String);
        args.Add("ContactPhone", contactPhone, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Inventory_CreateSupplier(@ChainId, @Name, @ContactEmail, @ContactPhone, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<SupplierDto>> sp_Inventory_GetSuppliersAsync(IDbConnection db, int chainId)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        return db.QueryAsync<SupplierDto>("SELECT * FROM public.sp_Inventory_GetSuppliers(@ChainId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Inventory_UpdateSupplierAsync(IDbConnection db, int id, string name, string? contactEmail, string? contactPhone, bool isActive, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("ContactEmail", contactEmail, DbType.String);
        args.Add("ContactPhone", contactPhone, DbType.String);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Inventory_UpdateSupplier(@Id, @Name, @ContactEmail, @ContactPhone, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Inventory_DeleteSupplierAsync(IDbConnection db, int id, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Inventory_DeleteSupplier(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Inventory_CreateProductAsync(IDbConnection db, int locationId, int? supplierId, string name, string? sku, decimal price, int quantityOnHand, int reorderThreshold, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("SupplierId", supplierId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("SKU", sku, DbType.String);
        args.Add("Price", price, DbType.Decimal);
        args.Add("QuantityOnHand", quantityOnHand, DbType.Int32);
        args.Add("ReorderThreshold", reorderThreshold, DbType.Int32);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Inventory_CreateProduct(@LocationId, @SupplierId, @Name, @SKU, @Price, @QuantityOnHand, @ReorderThreshold, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<ProductDto>> sp_Inventory_GetProductsAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<ProductDto>("SELECT * FROM public.sp_Inventory_GetProducts(@LocationId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Inventory_UpdateProductAsync(IDbConnection db, int id, int? supplierId, string name, string? sku, decimal price, int reorderThreshold, bool isActive, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("SupplierId", supplierId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("SKU", sku, DbType.String);
        args.Add("Price", price, DbType.Decimal);
        args.Add("ReorderThreshold", reorderThreshold, DbType.Int32);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Inventory_UpdateProduct(@Id, @SupplierId, @Name, @SKU, @Price, @ReorderThreshold, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Inventory_DeleteProductAsync(IDbConnection db, int id, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Inventory_DeleteProduct(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<LowStockProductDto>> sp_Inventory_GetLowStockProductsAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<LowStockProductDto>("SELECT * FROM public.sp_Inventory_GetLowStockProducts(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Inventory_CreatePurchaseOrderAsync(IDbConnection db, int locationId, int supplierId, object lines, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("SupplierId", supplierId, DbType.Int32);
        args.Add("Lines", lines, DbType.Object);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Inventory_CreatePurchaseOrder(@LocationId, @SupplierId, @Lines, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<PurchaseOrderDto>> sp_Inventory_GetPurchaseOrdersAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<PurchaseOrderDto>("SELECT * FROM public.sp_Inventory_GetPurchaseOrders(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<SqlMapper.GridReader> sp_Inventory_GetPurchaseOrderDetailAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        const string sql = """
            SELECT * FROM public.fn_Inventory_PurchaseOrderHeader(@Id);
            SELECT * FROM public.fn_Inventory_PurchaseOrderLines(@Id);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public async Task sp_Inventory_ReceivePurchaseOrderAsync(IDbConnection db, int id, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Inventory_ReceivePurchaseOrder(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<BookingProductDto>> sp_Booking_GetProductsAsync(IDbConnection db, int bookingId)
    {
        var args = new DynamicParameters();
        args.Add("BookingId", bookingId, DbType.Int32);
        return db.QueryAsync<BookingProductDto>("SELECT * FROM public.sp_Booking_GetProducts(@BookingId)", args, commandType: CommandType.Text);
    }
}
