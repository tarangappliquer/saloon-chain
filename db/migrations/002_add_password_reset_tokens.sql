-- Migration: add dbo.PasswordResetTokens for forgot-password/reset-password and the "set your
-- password" email sent when an admin creates a staff/customer account.
-- Idempotent -- safe to re-run. Run this against an existing database instead of re-running
-- 01_tables.sql (CREATE TABLE would fail on tables that already exist). After this, re-run
-- 03_procs.sql to pick up the new sp_Auth_CreatePasswordResetToken/GetPasswordResetToken/
-- ConsumePasswordResetToken/UpdatePassword/RevokeAllRefreshTokens procs.

IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'PasswordResetTokens' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.PasswordResetTokens (
        Id           INT IDENTITY(1,1) PRIMARY KEY,
        UserId       INT NOT NULL REFERENCES dbo.Users(Id),
        TokenHash    VARBINARY(32) NOT NULL UNIQUE,
        ExpiresAt    DATETIME2 NOT NULL,
        ResetDate    DATETIME2 NULL,
        CreatedDate  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_PasswordResetTokens_UserId ON dbo.PasswordResetTokens(UserId);
END
GO
