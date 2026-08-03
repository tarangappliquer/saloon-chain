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
}

export interface HoldResponse {
  bookingId: number;
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
}

export interface MyBookingTreatment {
  treatmentName: string;
  slotCount: number;
  price: number;
}

export interface MyBooking {
  id: number;
  locationName: string;
  therapistName: string;
  startTime: string;
  endTime: string;
  status: string;
  treatments: MyBookingTreatment[];
}

export interface Profile {
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  photoPath: string | null;
}
