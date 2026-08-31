import type {
  AdminBookingDto,
  AdminChainDto,
  AdminCustomerDto,
  AdminCustomersPageDto,
  AdminLocationDto,
  AdminTreatmentDto,
  AuthResponse as ApiAuthResponse,
  BlockedSlotDto,
  CustomerSummaryDto,
  LocationClosureDto,
  LocationDayScheduleDto,
  PaymentDto,
  ProfileResponse,
  RoomDto,
  RoomOpeningDto,
  RosterDto,
  StaffBookingTreatmentLineDto,
  StaffUserDto,
  TherapistDto,
  TherapistShiftDto,
  TreatmentCategoryDto,
  TreatmentDurationDto,
  TreatmentPriceDto,
} from '@saloon/api-client';

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

export type AuthResponse = Omit<ApiAuthResponse, 'role'> & {
  role: UserRole;
  emulatedByName?: string | null;
  photoPath?: string | null;
  emulatorChainId?: number | null;
  emulatorLocationId?: number | null;
};

export type Chain = AdminChainDto;
export type Location = AdminLocationDto;
export type ClosureType = 'Holiday' | 'Maintenance';
export type LocationClosure = LocationClosureDto;
export type LocationDaySchedule = LocationDayScheduleDto;
export type TreatmentCategory = TreatmentCategoryDto;
export type Treatment = AdminTreatmentDto;
export type TreatmentPrice = TreatmentPriceDto;
export type TreatmentDuration = TreatmentDurationDto;
export type Therapist = TherapistDto;
export type Room = RoomDto;

export type StaffUser = Omit<StaffUserDto, 'role'> & {
  role: UserRole;
};

export type CustomerSummary = CustomerSummaryDto;
export type AdminCustomer = AdminCustomerDto;
export type AdminCustomersPage = Omit<AdminCustomersPageDto, 'items'> & {
  items: AdminCustomer[];
};

export type AdminBookingTreatment = StaffBookingTreatmentLineDto;
export type AdminBooking = AdminBookingDto;

export type ShiftType = 'Morning' | 'Evening';
export type TherapistShift = TherapistShiftDto;
export type RoomOpening = RoomOpeningDto;
export type BlockedSlot = BlockedSlotDto;
export type Roster = RosterDto;

export type Profile = ProfileResponse;

export type PaymentRecord = PaymentDto;
