import type { UserRole } from './api/types';

export const ROOT_SUPER_ADMIN_ONLY: UserRole[] = ['RootSuperAdmin'];
export const ADMIN_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager'];
export const STAFF_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other'];
export const LOCATION_MANAGEMENT: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin'];
export const MANAGER_ONLY: UserRole[] = ['Manager'];
