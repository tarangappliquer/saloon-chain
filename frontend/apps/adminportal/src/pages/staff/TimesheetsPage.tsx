import { PageHeader } from '@saloon/ui';
import { AttendanceTab } from './AttendanceTab';

// Therapist roster management (add/activate/deactivate TherapistProfile rows) lives on the Team
// Members page (/staff/users) now -- this page is attendance/timesheets only.
export function TimesheetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Timesheets"
        description="Record daily staff arrival/left timestamps and view on-duty availability."
      />
      <AttendanceTab />
    </div>
  );
}
