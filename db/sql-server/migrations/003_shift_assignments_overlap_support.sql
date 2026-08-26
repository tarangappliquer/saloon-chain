-- Migration 003: Support overlapping room coverage in ShiftAssignments -- a room can now hold more
-- than one therapist across a shift (e.g. a primary covering 9-2 & 3-6, a proxy covering 2-3),
-- instead of the old one-therapist-per-room-per-shift rule. Idempotent -- safe to re-run.
-- Run this against an existing database instead of re-running 01_tables.sql (CREATE TABLE would
-- fail on tables that already exist). After this, re-run 03_procs.sql to pick up the rewritten
-- sp_Scheduling_AssignTherapistShift and the new sp_Scheduling_HasShiftOverlap.

-- 1. Drop the old "one therapist per room per shift" constraint -- overlap is now rejected at the
--    application layer instead (SchedulingRepository.HasShiftOverlapAsync), the same pattern already
--    used for blocked-slot overlap, so two different therapists can't double-book the same room/time
--    without a DB constraint forcing a single occupant for the whole shift.
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_ShiftAssignments_Location_Room_Shift_Date' AND object_id = OBJECT_ID('dbo.ShiftAssignments')
)
BEGIN
    DROP INDEX UQ_ShiftAssignments_Location_Room_Shift_Date ON dbo.ShiftAssignments;
END
GO

-- 2. Replace the old "one row per therapist per shift" constraint with one that includes StartTime,
--    so a therapist can hold more than one window in the same shift (e.g. before and after a proxy
--    covers an interval for them).
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_ShiftAssignments_Location_Therapist_Shift_Date' AND object_id = OBJECT_ID('dbo.ShiftAssignments')
)
BEGIN
    DROP INDEX UQ_ShiftAssignments_Location_Therapist_Shift_Date ON dbo.ShiftAssignments;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_ShiftAssignments_Therapist_Shift_Date_Start' AND object_id = OBJECT_ID('dbo.ShiftAssignments')
)
BEGIN
    CREATE UNIQUE INDEX UQ_ShiftAssignments_Therapist_Shift_Date_Start
        ON dbo.ShiftAssignments(LocationId, TherapistId, ShiftType, WorkDate, StartTime) WHERE IsDelete = 0;
END
GO
