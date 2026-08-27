import { useOutletContext } from 'react-router-dom';
import type { Treatment } from '../../api/types';

// Lives here (not in BookPage) so the step components can read the outlet context
// without statically importing BookPage -- that back-import defeats BookPage's
// lazy() split. See [INEFFECTIVE_DYNAMIC_IMPORT].
export interface BookingContext {
  treatments: Treatment[];
  locationId: number | null;
  saloonName: string | null;
  locationName: string | null;
}

export function useBookingContext() {
  return useOutletContext<BookingContext>();
}
