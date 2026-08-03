-- Shared by self-registration (Role='Customer', @CreatedBy=NULL) and admin-created staff
-- logins (Role='SuperAdmin'/'Admin'/'Manager'/'Therapist', @CreatedBy=the admin's user id).
CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreateUser
    @Name          NVARCHAR(200),
    @Email         NVARCHAR(256),
    @PasswordHash  VARBINARY(256),
    @PasswordSalt  VARBINARY(128),
    @Phone         NVARCHAR(30) = NULL,
    @Role          VARCHAR(20) = 'Customer',
    @ChainId       INT = NULL,
    @LocationId    INT = NULL,
    @TherapistId   INT = NULL,
    @CreatedBy     INT = NULL, -- NULL for self-registration (no logged-in user yet)
    @UserId        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @Email AND IsDelete = 0)
        THROW 50010, 'Email already registered.', 1;

    INSERT INTO dbo.Users (Name, Email, PasswordHash, PasswordSalt, Phone, Role, ChainId, LocationId, TherapistId, CreatedBy)
    VALUES (@Name, @Email, @PasswordHash, @PasswordSalt, @Phone, @Role, @ChainId, @LocationId, @TherapistId, @CreatedBy);

    SET @UserId = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetUserByEmail
    @Email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Email, PasswordHash, PasswordSalt, Role, ChainId, LocationId, TherapistId, IsEmulator
    FROM dbo.Users
    WHERE Email = @Email AND IsDelete = 0 AND IsActive = 1;
END
GO

-- Backs the emulation exchange (sp_Auth_EmulateCustomer is called from AuthService, not here directly):
-- looks up the emulating staff member (to check IsEmulator) and the target customer, both by id.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetUserById
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Email, PasswordHash, PasswordSalt, Role, ChainId, LocationId, TherapistId, IsEmulator
    FROM dbo.Users
    WHERE Id = @Id AND IsDelete = 0 AND IsActive = 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreateRefreshToken
    @UserId    INT,
    @TokenHash VARBINARY(32),
    @ExpiresAt DATETIME2,
    @Id        INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.RefreshTokens (UserId, TokenHash, ExpiresAt)
    VALUES (@UserId, @TokenHash, @ExpiresAt);

    SET @Id = SCOPE_IDENTITY();
END
GO

-- Backs both /api/auth/refresh (mint a new access token) and /api/auth/logout (revoke on sign-out) --
-- joins straight through to Users so AuthService can re-mint an access token from one round trip
-- without a second lookup. Caller (AuthService.RefreshAsync) is responsible for checking
-- ExpiresAt/RevokedDate before trusting the row.
CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetRefreshToken
    @TokenHash VARBINARY(32)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT rt.Id, rt.UserId, rt.ExpiresAt, rt.RevokedDate,
           u.Name, u.Email, u.Role, u.ChainId, u.LocationId, u.TherapistId, u.IsEmulator
    FROM dbo.RefreshTokens rt
    JOIN dbo.Users u ON u.Id = rt.UserId
    WHERE rt.TokenHash = @TokenHash AND u.IsDelete = 0 AND u.IsActive = 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_RevokeRefreshToken
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RefreshTokens SET RevokedDate = SYSUTCDATETIME()
    WHERE Id = @Id AND RevokedDate IS NULL;
END
GO
