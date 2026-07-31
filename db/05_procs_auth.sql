CREATE OR ALTER PROCEDURE dbo.sp_Auth_CreateCustomer
    @Name          NVARCHAR(200),
    @Email         NVARCHAR(256),
    @PasswordHash  VARBINARY(256),
    @PasswordSalt  VARBINARY(128),
    @Phone         NVARCHAR(30) = NULL,
    @CreatedBy     INT = NULL, -- NULL for self-registration (no logged-in user yet)
    @CustomerId    INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.Customers WHERE Email = @Email AND IsDelete = 0)
        THROW 50010, 'Email already registered.', 1;

    INSERT INTO dbo.Customers (Name, Email, PasswordHash, PasswordSalt, Phone, CreatedBy)
    VALUES (@Name, @Email, @PasswordHash, @PasswordSalt, @Phone, @CreatedBy);

    SET @CustomerId = SCOPE_IDENTITY();
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Auth_GetCustomerByEmail
    @Email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Email, PasswordHash, PasswordSalt
    FROM dbo.Customers
    WHERE Email = @Email AND IsDelete = 0 AND IsActive = 1;
END
GO
