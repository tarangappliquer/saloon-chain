namespace SaloonApi.Shared.Auth;

// Mirrors the Role CHECK constraint on dbo.Users. Order top-to-bottom is broad-to-narrow scope,
// not a privilege ranking -- don't rely on ordinal comparisons for access checks.
internal enum UserRole
{
    SuperAdmin,
    Admin,
    Manager,
    Therapist,
    Customer
}
