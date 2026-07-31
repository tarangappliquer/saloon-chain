-- Self-service profile management (any logged-in role) -- name/phone editing and a profile photo,
-- backed by dbo.StaffProfiles/dbo.CustomerProfiles (see 01_tables.sql). Run after 01-09.

CREATE OR ALTER PROCEDURE dbo.sp_Profile_GetStaff
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Name, u.Email, u.Phone, u.Role, sp.PhotoPath
    FROM dbo.Users u
    LEFT JOIN dbo.StaffProfiles sp ON sp.UserId = u.Id
    WHERE u.Id = @UserId AND u.IsDelete = 0;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Profile_GetCustomer
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Id, u.Name, u.Email, u.Phone, u.Role, cp.PhotoPath
    FROM dbo.Users u
    LEFT JOIN dbo.CustomerProfiles cp ON cp.UserId = u.Id
    WHERE u.Id = @UserId AND u.IsDelete = 0;
END
GO

-- Deliberately narrow (Name/Phone only) -- unlike sp_Admin_UpdateUser, this is self-service, so it
-- must never touch Role/ChainId/LocationId/TherapistId/IsEmulator/IsActive.
CREATE OR ALTER PROCEDURE dbo.sp_Profile_UpdateSelf
    @UserId INT,
    @Name   NVARCHAR(200),
    @Phone  NVARCHAR(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users
    SET Name = @Name, Phone = @Phone, UpdatedBy = @UserId, UpdatedDate = SYSUTCDATETIME()
    WHERE Id = @UserId AND IsDelete = 0;

    IF @@ROWCOUNT = 0
        THROW 50040, 'User not found.', 1;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Profile_SetStaffPhoto
    @UserId    INT,
    @PhotoPath NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.StaffProfiles AS target
    USING (SELECT @UserId AS UserId) AS src ON target.UserId = src.UserId
    WHEN MATCHED THEN
        UPDATE SET PhotoPath = @PhotoPath, UpdatedBy = @UserId, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, PhotoPath, UpdatedBy, UpdatedDate) VALUES (@UserId, @PhotoPath, @UserId, SYSUTCDATETIME());
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Profile_SetCustomerPhoto
    @UserId    INT,
    @PhotoPath NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.CustomerProfiles AS target
    USING (SELECT @UserId AS UserId) AS src ON target.UserId = src.UserId
    WHEN MATCHED THEN
        UPDATE SET PhotoPath = @PhotoPath, UpdatedDate = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (UserId, PhotoPath, UpdatedDate) VALUES (@UserId, @PhotoPath, SYSUTCDATETIME());
END
GO
