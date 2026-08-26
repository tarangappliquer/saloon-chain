using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Admin.Endpoints;
using SaloonApi.Modules.Catalog.Infrastructure;
using SaloonApi.Modules.Identity.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class AdminDbService
{
    public Task<RefCursorGridReader> sp_Admin_GetDashboardStatsAsync(
        IDbConnection db, string role, int? chainId, int? locationId, object? startDate, object? endDate)
    {
        var args = new DynamicParameters();
        args.Add("Role", role, DbType.String);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("StartDate", startDate);
        args.Add("EndDate", endDate);
        return RefCursorGridReader.ExecuteAsync(db, "public.sp_Admin_GetDashboardStats", args);
    }

    public Task<IEnumerable<CancelReasonDto>> sp_Admin_GetCancelReasonsAsync(IDbConnection db)
    {
        return db.QueryAsync<CancelReasonDto>("SELECT * FROM public.sp_Admin_GetCancelReasons()", commandType: CommandType.Text);
    }

    public Task<IEnumerable<BlockTypeDto>> sp_Admin_GetBlockTypesAsync(IDbConnection db, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<BlockTypeDto>("SELECT * FROM public.sp_Admin_GetBlockTypes(@ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Admin_CreateBlockTypeAsync(IDbConnection db, int? chainId, int? locationId, string name, bool isLocationBreak, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("IsLocationBreak", isLocationBreak, DbType.Boolean);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Admin_CreateBlockType(@ChainId, @LocationId, @Name, @IsLocationBreak, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_UpdateBlockTypeAsync(IDbConnection db, int id, string name, bool isLocationBreak, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("IsLocationBreak", isLocationBreak, DbType.Boolean);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_UpdateBlockType(@Id, @Name, @IsLocationBreak, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_DeleteBlockTypeAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_DeleteBlockType(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<AppointmentStatusDto>> sp_Admin_GetAppointmentStatusesAsync(IDbConnection db, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<AppointmentStatusDto>("SELECT * FROM public.sp_Admin_GetAppointmentStatuses(@ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Admin_CreateAppointmentStatusAsync(IDbConnection db, int? chainId, int? locationId, string name, string? colorHex, int displayOrder, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("ColorHex", colorHex, DbType.String);
        args.Add("DisplayOrder", displayOrder, DbType.Int32);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Admin_CreateAppointmentStatus(@ChainId, @LocationId, @Name, @ColorHex, @DisplayOrder, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_UpdateAppointmentStatusAsync(IDbConnection db, int id, string name, string? colorHex, int displayOrder, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("ColorHex", colorHex, DbType.String);
        args.Add("DisplayOrder", displayOrder, DbType.Int32);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_UpdateAppointmentStatus(@Id, @Name, @ColorHex, @DisplayOrder, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_DeleteAppointmentStatusAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_DeleteAppointmentStatus(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<UserRow?> sp_Admin_GetUserByIdAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<UserRow>("SELECT * FROM public.sp_Admin_GetUserById(@Id)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<CustomerSummaryDto>> sp_Admin_SearchCustomersAsync(IDbConnection db, string search, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("Search", search, DbType.String);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<CustomerSummaryDto>("SELECT * FROM public.sp_Admin_SearchCustomers(@Search, @ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<AdminCustomerDto>> sp_Admin_GetCustomersAsync(IDbConnection db, string? search, int? chainId, int? locationId, int pageSize, string? cursorName, int? cursorId)
    {
        var args = new DynamicParameters();
        args.Add("Search", search, DbType.String);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("PageSize", pageSize, DbType.Int32);
        args.Add("CursorName", cursorName, DbType.String);
        args.Add("CursorId", cursorId, DbType.Int32);
        return db.QueryAsync<AdminCustomerDto>("SELECT * FROM public.sp_Admin_GetCustomers(@Search, @ChainId, @LocationId, @PageSize, @CursorName, @CursorId)", args, commandType: CommandType.Text);
    }

    public Task<CustomerProfileDto?> sp_Admin_GetCustomerProfileAsync(IDbConnection db, int customerId)
    {
        var args = new DynamicParameters();
        args.Add("CustomerId", customerId, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<CustomerProfileDto>("SELECT * FROM public.sp_Admin_GetCustomerProfile(@CustomerId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_UpdateCustomerAsync(IDbConnection db, int id, string name, string? phone, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("Phone", phone, DbType.String);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_UpdateCustomer(@Id, @Name, @Phone, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_DeleteCustomerAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_DeleteCustomer(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_UpdateUserAsync(IDbConnection db, int id, string name, string? phone, string? role, int? chainId, int? locationId, int? therapistId, bool isEmulator, DateOnly? joiningDate, bool isActive, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("Name", name, DbType.String);
        args.Add("Phone", phone, DbType.String);
        args.Add("Role", role, DbType.String);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("TherapistId", therapistId, DbType.Int32);
        args.Add("IsEmulator", isEmulator, DbType.Boolean);
        args.Add("JoiningDate", joiningDate, DbType.Date);
        args.Add("IsActive", isActive, DbType.Boolean);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_UpdateUser(@Id, @Name, @Phone, @Role, @ChainId, @LocationId, @TherapistId, @IsEmulator, @JoiningDate, @IsActive, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<AdminChainDto>> sp_Admin_GetChainsAsync(IDbConnection db, int? chainId)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        return db.QueryAsync<AdminChainDto>("SELECT * FROM public.sp_Admin_GetChains(@ChainId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<AdminLocationDto>> sp_Admin_GetLocationsAsync(IDbConnection db, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<AdminLocationDto>("SELECT * FROM public.sp_Admin_GetLocations(@ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<AdminTreatmentRow>> sp_Admin_GetTreatmentsAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<AdminTreatmentRow>("SELECT * FROM public.sp_Admin_GetTreatments(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<LocationClosureRow>> sp_Admin_GetLocationClosuresAsync(IDbConnection db, int? locationId, int? chainId, int? id)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("Id", id, DbType.Int32);
        return db.QueryAsync<LocationClosureRow>("SELECT * FROM public.sp_Admin_GetLocationClosures(@LocationId, @ChainId, @Id)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_CreateLocationClosuresAsync(IDbConnection db, int[] locationIds, DateOnly fromDate, DateOnly toDate, string type, string? reason, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationIds", locationIds, DbType.Object);
        args.Add("FromDate", fromDate, DbType.Date);
        args.Add("ToDate", toDate, DbType.Date);
        args.Add("Type", type, DbType.String);
        args.Add("Reason", reason, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_CreateLocationClosures(@LocationIds, @FromDate, @ToDate, @Type, @Reason, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Admin_DeleteLocationClosureAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Admin_DeleteLocationClosure(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<CustomerNoteDto>> sp_CustomerNote_GetForCustomerAsync(IDbConnection db, int customerId, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<CustomerNoteDto>("SELECT * FROM public.sp_CustomerNote_GetForCustomer(@CustomerId, @ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_CustomerNote_CreateAsync(IDbConnection db, int customerId, int? chainId, int? locationId, string note, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("Note", note, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_CustomerNote_Create(@CustomerId, @ChainId, @LocationId, @Note, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_CustomerNote_DeleteAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_CustomerNote_Delete(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<CustomerTagDto>> sp_CustomerTag_GetForCustomerAsync(IDbConnection db, int customerId, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<CustomerTagDto>("SELECT * FROM public.sp_CustomerTag_GetForCustomer(@CustomerId, @ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_CustomerTag_AddAsync(IDbConnection db, int customerId, int? chainId, int? locationId, string tag, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("CustomerId", customerId, DbType.Int32);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("Tag", tag, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_CustomerTag_Add(@CustomerId, @ChainId, @LocationId, @Tag, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_CustomerTag_DeleteAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_CustomerTag_Delete(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }
}
