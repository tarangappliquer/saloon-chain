using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Scheduling.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class SchedulingDbService
{
    public Task<SqlMapper.GridReader> sp_Scheduling_GetRosterAsync(IDbConnection db, int locationId, DateOnly date)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("WorkDate", date.ToDateTime(TimeOnly.MinValue), DbType.Date);
        const string sql = """
            SELECT * FROM public.fn_Scheduling_RosterShifts(@LocationId, @WorkDate);
            SELECT * FROM public.fn_Scheduling_RosterRoomOpenings(@LocationId, @WorkDate);
            SELECT * FROM public.fn_Scheduling_RosterBlocks(@LocationId, @WorkDate);
            """;
        return db.QueryMultipleAsync(sql, args, commandType: CommandType.Text);
    }

    public Task<int> sp_Scheduling_AssignTherapistShiftAsync(
        IDbConnection db, int locationId, int therapistId, int roomId, string shiftType, DateOnly date, TimeSpan startTime, TimeSpan endTime, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("TherapistId", therapistId, DbType.Int32);
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("ShiftType", shiftType, DbType.String);
        args.Add("WorkDate", date.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("StartTime", startTime, DbType.Time);
        args.Add("EndTime", endTime, DbType.Time);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Scheduling_AssignTherapistShift(@LocationId, @TherapistId, @RoomId, @ShiftType, @WorkDate, @StartTime, @EndTime, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_Scheduling_HasShiftOverlapAsync(
        IDbConnection db, int roomId, string shiftType, DateOnly workDate, TimeSpan startTime, TimeSpan endTime, int excludeTherapistId)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("ShiftType", shiftType, DbType.String);
        args.Add("WorkDate", workDate.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("StartTime", startTime, DbType.Time);
        args.Add("EndTime", endTime, DbType.Time);
        args.Add("ExcludeTherapistId", excludeTherapistId, DbType.Int32);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_Scheduling_HasShiftOverlap(@RoomId, @ShiftType, @WorkDate, @StartTime, @EndTime, @ExcludeTherapistId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Scheduling_RemoveTherapistShiftAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Scheduling_RemoveTherapistShift(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Scheduling_UpdateTherapistShiftAsync(IDbConnection db, int id, TimeSpan startTime, TimeSpan endTime, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("StartTime", startTime, DbType.Time);
        args.Add("EndTime", endTime, DbType.Time);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Scheduling_UpdateTherapistShift(@Id, @StartTime, @EndTime, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<int?> sp_Scheduling_GetShiftLocationIdAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.ExecuteScalarAsync<int?>("SELECT * FROM public.sp_Scheduling_GetShiftLocationId(@Id)", args, commandType: CommandType.Text);
    }

    public Task<ShiftDetailsDto?> sp_Scheduling_GetShiftDetailsAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<ShiftDetailsDto>("SELECT * FROM public.sp_Scheduling_GetShiftDetails(@Id)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_Scheduling_HasShiftBookingsAsync(IDbConnection db, int shiftId)
    {
        var args = new DynamicParameters();
        args.Add("ShiftId", shiftId, DbType.Int32);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_Scheduling_HasShiftBookings(@ShiftId)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Scheduling_OpenRoomAsync(IDbConnection db, int roomId, int treatmentCategoryId, string shiftType, DateOnly date, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("TreatmentCategoryId", treatmentCategoryId, DbType.Int32);
        args.Add("ShiftType", shiftType, DbType.String);
        args.Add("WorkDate", date.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Scheduling_OpenRoom(@RoomId, @TreatmentCategoryId, @ShiftType, @WorkDate, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Scheduling_CloseRoomAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Scheduling_CloseRoom(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<int?> sp_Scheduling_GetRoomOpeningLocationIdAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.ExecuteScalarAsync<int?>("SELECT * FROM public.sp_Scheduling_GetRoomOpeningLocationId(@Id)", args, commandType: CommandType.Text);
    }

    public Task<RoomOpeningDetailsDto?> sp_Scheduling_GetRoomOpeningDetailsAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<RoomOpeningDetailsDto>("SELECT * FROM public.sp_Scheduling_GetRoomOpeningDetails(@Id)", args, commandType: CommandType.Text);
    }

    public Task<RoomOpeningDetailsDto?> sp_Scheduling_GetRoomOpeningByKeysAsync(IDbConnection db, int roomId, DateOnly workDate, string shiftType)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("WorkDate", workDate.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("ShiftType", shiftType, DbType.String);
        return db.QuerySingleOrDefaultAsync<RoomOpeningDetailsDto>("SELECT * FROM public.sp_Scheduling_GetRoomOpeningByKeys(@RoomId, @WorkDate, @ShiftType)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_Scheduling_HasRoomBookingsAsync(IDbConnection db, int roomId, DateOnly workDate)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("WorkDate", workDate.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_Scheduling_HasRoomBookings(@RoomId, @WorkDate)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_Scheduling_HasRoomOpeningAsync(IDbConnection db, int roomId, DateOnly workDate)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("WorkDate", workDate.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_Scheduling_HasRoomOpening(@RoomId, @WorkDate)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_Scheduling_HasBookingOverlapAsync(IDbConnection db, int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("WorkDate", workDate.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("StartTime", startTime, DbType.Time);
        args.Add("EndTime", endTime, DbType.Time);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_Scheduling_HasBookingOverlap(@RoomId, @WorkDate, @StartTime, @EndTime)", args, commandType: CommandType.Text);
    }

    public Task<bool> sp_Scheduling_HasBlockOverlapAsync(IDbConnection db, int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("WorkDate", workDate.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("StartTime", startTime, DbType.Time);
        args.Add("EndTime", endTime, DbType.Time);
        return db.ExecuteScalarAsync<bool>("SELECT * FROM public.sp_Scheduling_HasBlockOverlap(@RoomId, @WorkDate, @StartTime, @EndTime)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Scheduling_BlockSlotAsync(IDbConnection db, int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime, string reason, int? blockTypeId, int createdBy)
    {
        var args = new DynamicParameters();
        args.Add("RoomId", roomId, DbType.Int32);
        args.Add("BlockTypeId", blockTypeId, DbType.Int32);
        args.Add("WorkDate", workDate.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("StartTime", startTime, DbType.Time);
        args.Add("EndTime", endTime, DbType.Time);
        args.Add("Reason", reason, DbType.String);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Scheduling_BlockSlot(@RoomId, @BlockTypeId, @WorkDate, @StartTime, @EndTime, @Reason, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Scheduling_UnblockSlotAsync(IDbConnection db, int id, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Scheduling_UnblockSlot(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public async Task sp_Scheduling_UpdateBlockedSlotAsync(IDbConnection db, int id, TimeSpan startTime, TimeSpan endTime, string reason, int? blockTypeId, int updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("BlockTypeId", blockTypeId, DbType.Int32);
        args.Add("StartTime", startTime, DbType.Time);
        args.Add("EndTime", endTime, DbType.Time);
        args.Add("Reason", reason, DbType.String);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Scheduling_UpdateBlockedSlot(@Id, @BlockTypeId, @StartTime, @EndTime, @Reason, @UpdatedBy)", args, commandType: CommandType.Text);
    }

    public Task<BlockedSlotDetailsDto?> sp_Scheduling_GetBlockedSlotDetailsAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<BlockedSlotDetailsDto>("SELECT * FROM public.sp_Scheduling_GetBlockedSlotDetails(@Id)", args, commandType: CommandType.Text);
    }
}
