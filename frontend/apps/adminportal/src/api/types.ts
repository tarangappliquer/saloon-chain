export type UserRole = 'RootSuperAdmin' | 'SuperAdmin' | 'Admin' | 'Manager' | 'Receptionist' | 'Therapist' | 'Other' | 'Customer';

const ROLE_MAP: Record<number, UserRole> = {
  0: 'RootSuperAdmin',
  1: 'SuperAdmin',
  2: 'Admin',
  3: 'Manager',
  4: 'Receptionist',
  5: 'Therapist',
  6: 'Other',
  7: 'Customer',
};

export function normalizeUserRole(role: unknown): UserRole {
  if (typeof role === 'number' && ROLE_MAP[role]) {
    return ROLE_MAP[role];
  }
  if (typeof role === 'string') {
    const num = Number(role);
    if (!isNaN(num) && ROLE_MAP[num]) {
      return ROLE_MAP[num];
    }
    return role as UserRole;
  }
  return 'Other';
}

export interface AuthResponse {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  token: string;
  canEmulate: boolean;
  isEmulated: boolean;
  emulatedByName: string | null;
  refreshToken: string;
  photoPath: string | null;
  isEmailVerified: boolean;
}

export interface Chain {
  id: number;
  name: string;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
  isActive?: boolean;
}

export interface Location {
  id: number;
  chainId: number;
  name: string;
  address: string | null;
  openTime: string;
  closeTime: string;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
  workingDaysMask: number;
  timeZoneId: string;
  isActive?: boolean;
}

export interface TreatmentCategory {
  id: number;
  locationId: number;
  name: string;
  isActive?: boolean;
}

export interface Treatment {
  id: number;
  categoryId: number;
  categoryName?: string;
  name: string;
  description?: string | null;
  // null only when the treatment's sole price is future-dated (not yet effective).
  price: number | null;
  durationSlots: number;
  preTimeMinutes: number;
  // Go-live date: gates client-portal visibility/bookability independently of price.
  effectiveFrom: string;
  isActive?: boolean;
}

export interface TreatmentPrice {
  id: number;
  price: number;
  effectiveFrom: string;
}

export interface TreatmentDuration {
  id: number;
  durationSlots: number;
  preTimeMinutes: number;
  effectiveFrom: string;
}

export interface Therapist {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Room {
  id: number;
  locationId: number;
  name: string;
  isActive: boolean;
}

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  chainId: number | null;
  locationId: number | null;
  therapistId: number | null;
  isEmulator: boolean;
  isActive: boolean;
  createdDate: string;
}

export interface CustomerSummary {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  canEmulate?: boolean;
}

export interface AdminCustomer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdDate: string;
  canEmulate?: boolean;
}

export interface AdminBookingTreatment {
  roomId?: number | null;
  treatmentName: string;
  roomName: string | null;
  therapistName: string | null;
  startTime: string | null;
  endTime: string | null;
  slotCount: number;
  price: number;
}

export interface AdminBooking {
  id: number;
  locationName: string;
  customerName: string;
  customerEmail: string;
  status: string;
  treatments: AdminBookingTreatment[];
}

export type ShiftType = 'Morning' | 'Evening';

export interface TherapistShift {
  id: number;
  therapistId: number;
  therapistName: string;
  roomId: number | null;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
}

export interface RoomOpening {
  id: number;
  roomId: number;
  roomName: string;
  treatmentCategoryId: number;
  categoryName: string;
  shiftType: ShiftType;
}

export interface BlockedSlot {
  id: number;
  roomId: number;
  roomName: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface Roster {
  therapistShifts: TherapistShift[];
  roomOpenings: RoomOpening[];
  blockedSlots: BlockedSlot[];
}

export interface Profile {
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  photoPath: string | null;
  isEmailVerified: boolean;
}

export interface PaymentRecord {
  id: number;
  bookingId: number;
  amount: number;
  currency: string;
  provider: string;
  paymentMethod: string;
  status: string;
  transactionId: string | null;
  failureReason: string | null;
  createdDate: string;
}
