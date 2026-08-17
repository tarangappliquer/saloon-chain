-- Migration 008: Prevent duplicate Finalized pay runs for the same location+period.
-- sp_Payroll_CreatePayRun (03_procs.sql) now also rejects this at the app layer with THROW 50067 --
-- this filtered unique index is the DB-level backstop, same pattern as UX_CommissionRules_Location_Therapist.

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_PayRuns_Location_Period_Finalized' AND object_id = OBJECT_ID('dbo.PayRuns'))
BEGIN
    CREATE UNIQUE INDEX UX_PayRuns_Location_Period_Finalized ON dbo.PayRuns(LocationId, PeriodStart, PeriodEnd) WHERE Status = 'Finalized';
END
GO
