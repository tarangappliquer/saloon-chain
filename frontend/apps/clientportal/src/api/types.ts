import type {
  AuthResponse as ApiAuthResponse,
  AvailableSlot,
  BookingDetailsDto,
  BookingTreatmentLineDto,
  ChainDto,
  LocationDto,
  MyBookingDto,
  ProfileResponse,
  ScheduleResponse,
  TreatmentDto,
  TreatmentDurationDto,
  TreatmentPriceDto,
} from '@saloon/api-client';

export type Chain = ChainDto;
export type Location = LocationDto;
export type Treatment = TreatmentDto;
export type TreatmentPrice = TreatmentPriceDto;
export type TreatmentDuration = TreatmentDurationDto;
export type { AvailableSlot, ScheduleResponse };
export type BookingTreatmentLine = BookingTreatmentLineDto;
export type BookingDetails = BookingDetailsDto;

export type AuthResponse = ApiAuthResponse & {
  emulatedByName?: string | null;
  photoPath?: string | null;
  emulatorChainId?: number | null;
  emulatorLocationId?: number | null;
};

export type MyBooking = MyBookingDto & {
  hasReview?: boolean;
};

export type Profile = ProfileResponse;
