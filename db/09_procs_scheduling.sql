-- Staff scheduling: therapist shift assignments + room-category openings, for the admin portal's
-- Scheduling page (Admin/Manager -- see docs/architecture.md's "Shift/room-assignment CRUD" gap).
-- Reuses dbo.ShiftAssignments/dbo.RoomCategoryAssignments, which existed as schema only until now
-- (seeded manually via 06_seed.sql, read only by sp_Booking_GetAvailabilityData for slot math).
-- Run after 01-08.

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_GetRoster
    @LocationId INT,
    @WorkDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    SELECT sa.Id, sa.TherapistId, th.Name AS TherapistName, sa.ShiftType, sa.StartTime, sa.EndTime
    FROM dbo.ShiftAssignments sa
    JOIN dbo.Therapists th ON th.Id = sa.TherapistId
    WHERE sa.LocationId = @LocationId AND sa.WorkDate = @WorkDate AND sa.IsDelete = 0
    ORDER BY sa.ShiftType, th.Name;

    SELECT rca.Id, rca.RoomId, r.Name AS RoomName, rca.TreatmentCategoryId, tc.Name AS CategoryName, rca.ShiftType
    FROM dbo.RoomCategoryAssignments rca
    JOIN dbo.Rooms r ON r.Id = rca.RoomId
    JOIN dbo.TreatmentCategories tc ON tc.Id = rca.TreatmentCategoryId
    WHERE r.LocationId = @LocationId AND rca.WorkDate = @WorkDate AND rca.IsDelete = 0
    ORDER BY rca.ShiftType, r.Name;
END
GO

-- Upsert keyed on UQ_ShiftAssignments_Location_Therapist_Shift_Date: re-assigning the same
-- therapist to the same location/shift/date just updates the times and revives a removed row.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_AssignTherapistShift
    @LocationId  INT,
    @TherapistId INT,
    @ShiftType   VARCHAR(10),
    @WorkDate    DATE,
    @StartTime   TIME,
    @EndTime     TIME,
    @CreatedBy   INT,
    @Id          INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.ShiftAssignments AS target
    USING (SELECT @LocationId AS LocationId, @TherapistId AS TherapistId, @ShiftType AS ShiftType, @WorkDate AS WorkDate) AS src
        ON target.LocationId = src.LocationId AND target.TherapistId = src.TherapistId
           AND target.ShiftType = src.ShiftType AND target.WorkDate = src.WorkDate
    WHEN MATCHED THEN
        UPDATE SET StartTime = @StartTime, EndTime = @EndTime, IsActive = 1, IsDelete = 0,
                   UpdatedBy = @CreatedBy, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (LocationId, TherapistId, ShiftType, WorkDate, StartTime, EndTime, CreatedBy)
        VALUES (@LocationId, @TherapistId, @ShiftType, @WorkDate, @StartTime, @EndTime, @CreatedBy);

    SELECT @Id = Id FROM dbo.ShiftAssignments
    WHERE LocationId = @LocationId AND TherapistId = @TherapistId AND ShiftType = @ShiftType AND WorkDate = @WorkDate;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_RemoveTherapistShift
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.ShiftAssignments
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50030, 'Shift assignment not found.', 1;
END
GO

-- Upsert keyed on UQ_RoomCategoryAssignments_Room_Shift_Date: a room serves one category per
-- shift/date, so "opening" it again with a different category just changes which one.
CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_OpenRoom
    @RoomId              INT,
    @TreatmentCategoryId INT,
    @ShiftType           VARCHAR(10),
    @WorkDate            DATE,
    @CreatedBy           INT,
    @Id                  INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.RoomCategoryAssignments AS target
    USING (SELECT @RoomId AS RoomId, @ShiftType AS ShiftType, @WorkDate AS WorkDate) AS src
        ON target.RoomId = src.RoomId AND target.ShiftType = src.ShiftType AND target.WorkDate = src.WorkDate
    WHEN MATCHED THEN
        UPDATE SET TreatmentCategoryId = @TreatmentCategoryId, IsActive = 1, IsDelete = 0,
                   UpdatedBy = @CreatedBy, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (RoomId, TreatmentCategoryId, ShiftType, WorkDate, CreatedBy)
        VALUES (@RoomId, @TreatmentCategoryId, @ShiftType, @WorkDate, @CreatedBy);

    SELECT @Id = Id FROM dbo.RoomCategoryAssignments
    WHERE RoomId = @RoomId AND ShiftType = @ShiftType AND WorkDate = @WorkDate;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Scheduling_CloseRoom
    @Id        INT,
    @UpdatedBy INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RoomCategoryAssignments
    SET IsDelete = 1, UpdatedBy = @UpdatedBy, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50031, 'Room opening not found.', 1;
END
GO
