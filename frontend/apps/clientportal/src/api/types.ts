export interface Chain {
  id: number;
  name: string;
}

export interface Location {
  id: number;
  chainId: number;
  name: string;
  address: string | null;
  openTime: string;
  closeTime: string;
  workingDaysMask: number;
  timeZoneId: string;
}

export interface Treatment {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  price: number;
  durationSlots: number;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  roomId: number;
  therapistId: number;
  isHeld: boolean;
}

// One row per treatment in a booking. Schedule fields are null until that treatment's slot is
// picked — each treatment is scheduled (and held) independently, so it carries its own room/
// therapist/time/expiry rather than sharing one at the booking level.
export interface BookingTreatmentLine {
  id: number;
  treatmentId: number;
  treatmentName: string;
  roomId: number | null;
  therapistId: number | null;
  therapistName: string | null;
  startTime: string | null;
  endTime: string | null;
  expiresAt: string | null;
  slotCount: number;
  price: number;
}

export interface BookingDetails {
  id: number;
  locationId: number;
  locationName: string;
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  treatments: BookingTreatmentLine[];
}

export interface ScheduleResponse {
  expiresAt: string;
}

export interface AuthResponse {
  userId: number;
  name: string;
  email: string;
  role: string;
  token: string;
  canEmulate: boolean;
  isEmulated: boolean;
  emulatedByName: string | null;
  refreshToken: string;
  photoPath: string | null;
  isEmailVerified: boolean;
}

export interface MyBookingTreatment {
  treatmentName: string;
  therapistName: string | null;
  startTime: string | null;
  endTime: string | null;
  slotCount: number;
  price: number;
}

export interface MyBooking {
  id: number;
  locationName: string;
  status: string;
  createdDate?: string;
  paymentProvider?: string | null;
  paymentStatus?: string | null;
  isPaid?: boolean;
  treatments: MyBookingTreatment[];
}

export interface Profile {
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  photoPath: string | null;
  isEmailVerified: boolean;
}
