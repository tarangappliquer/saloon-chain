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
