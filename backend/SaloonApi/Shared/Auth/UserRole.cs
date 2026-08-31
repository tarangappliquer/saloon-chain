namespace SaloonApi.Shared.Auth;

// Mirrors the Role CHECK constraint on Users. Order top-to-bottom is broad-to-narrow scope,
// not a privilege ranking -- don't rely on ordinal comparisons for access checks.
internal enum UserRole
{
    RootSuperAdmin,
    SuperAdmin,
    Admin,
    Manager,
    Receptionist,
    Therapist,
    Other,
    Customer
}

internal static class UserRoleExtensions
{
    // RootSuperAdmin and SuperAdmin can always emulate a customer, regardless of the per-user
    // Users.IsEmulator flag. Every other role needs IsEmulator set. Single source of truth --
    // used by login, refresh, /me and the /api/auth/emulate authorization check.
    public static bool CanAlwaysEmulate(this UserRole role) =>
        role is UserRole.RootSuperAdmin or UserRole.SuperAdmin;
}
