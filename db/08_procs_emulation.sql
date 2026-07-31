-- Admin-as-customer emulation. Run after 01-07. See docs/initial-project-spec.md: "Super Admin/
-- Admin/Manager can be marked as emulator. emulator can emulate customer and access customer
-- portal on behalf of him."

-- Powers the admin-portal "Customers" picker used to start an emulation session -- search only,
-- no admin listing-all-customers use case exists yet so this always requires @Search.
CREATE OR ALTER PROCEDURE dbo.sp_Admin_SearchCustomers
    @Search NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (20) Id, Name, Email, Phone
    FROM dbo.Users
    WHERE Role = 'Customer' AND IsDelete = 0 AND IsActive = 1
      AND (Name LIKE '%' + @Search + '%' OR Email LIKE '%' + @Search + '%')
    ORDER BY Name;
END
GO
