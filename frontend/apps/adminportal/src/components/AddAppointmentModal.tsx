import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@saloon/ui';
import { adminCustomersApi, authApi, ApiError } from '../api/client';
import type { CustomerSummary } from '../api/types';
import type { TherapistShiftDto } from '@saloon/api-client';
import { appConfig } from '../config';

interface AddAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  locationId: number | null;
  roomId?: number;
  roomName?: string;
  workDate?: string;
  startTime?: string;
  therapists?: { id: number; name: string }[];
  therapistShifts?: TherapistShiftDto[];
  rooms?: { id: number; name: string }[];
}

export function AddAppointmentModal({
  isOpen,
  onClose,
  locationId,
  roomName,
  workDate,
  startTime,
}: AddAppointmentModalProps) {
  const clientPortalUrl = appConfig.clientPortalUrl;

  const [customerMode, setCustomerMode] = useState<'search' | 'new'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedResult, setPickedResult] = useState<CustomerSummary | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [resolvingCustomer, setResolvingCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCustomerMode('search');
    setSearchQuery('');
    setSearchResults([]);
    setPickedResult(null);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setError(null);
  }, [isOpen]);

  async function handleSearch(e: SyntheticEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersSearchGet(searchQuery.trim());
      setSearchResults(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to search customers');
    } finally {
      setSearching(false);
    }
  }

  // Resolves the customer step: picks/creates customer, emulates customer session, and opens
  // client portal directly to book on customer's behalf.
  async function handleContinueFromCustomer() {
    setError(null);
    let targetCustomer: CustomerSummary | null = null;

    if (customerMode === 'search') {
      if (!pickedResult) return;
      targetCustomer = pickedResult;
    } else {
      if (!newName.trim()) return;
      setResolvingCustomer(true);
      try {
        const { data } = await adminCustomersApi.apiAdminCustomersPost({
          name: newName.trim(),
          email: newEmail.trim() || '',
          phone: newPhone.trim() || '',
          isWalkIn: true,
        });
        targetCustomer = { id: Number(data.id), name: newName.trim(), email: newEmail.trim(), phone: newPhone.trim() || '' };
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to create walk-in customer');
        setResolvingCustomer(false);
        return;
      }
    }

    if (targetCustomer) {
      setResolvingCustomer(true);
      try {
        const { data } = await authApi.apiAuthEmulateCustomerIdPost(targetCustomer.id);
        const basePortalUrl = clientPortalUrl || window.location.origin.replace('5173', '5174');
        const targetUrl = `${basePortalUrl}/emulate?token=${encodeURIComponent(data.token)}&locationId=${locationId ?? ''}`;
        window.open(targetUrl, '_blank');
        onClose();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to start customer emulation session');
      } finally {
        setResolvingCustomer(false);
      }
    }
  }

  if (!isOpen) return null;

  const canContinueCustomer = customerMode === 'search' ? pickedResult !== null : newName.trim() !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="w-full max-w-lg shadow-2xl border-primary/30 my-8">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Add Appointment {roomName ? `— ${roomName}` : ''}</CardTitle>
          {workDate && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Date: <span className="font-semibold text-foreground">{workDate}</span>
              {startTime && (
                <>
                  {' '}
                  &bull; Starts at: <span className="font-semibold text-foreground">{startTime}</span>
                </>
              )}
            </p>
          )}
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {error && <div className="rounded-xl bg-destructive/15 border border-destructive/30 p-3 text-xs font-semibold text-destructive">{error}</div>}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Select customer to book on their behalf</label>
                <div className="flex rounded-lg border border-input overflow-hidden text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCustomerMode('search')}
                    className={`px-2.5 py-1 transition-colors ${customerMode === 'search' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}
                  >
                    Find existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode('new')}
                    className={`px-2.5 py-1 transition-colors ${customerMode === 'new' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}
                  >
                    New walk-in
                  </button>
                </div>
              </div>

              {customerMode === 'search' ? (
                pickedResult ? (
                  <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                    <div>
                      <p className="text-xs font-bold text-foreground">{pickedResult.name}</p>
                      <p className="text-[11px] text-muted-foreground">{pickedResult.email || pickedResult.phone}</p>
                    </div>
                    <button type="button" onClick={() => setPickedResult(null)} className="text-xs font-semibold text-muted-foreground hover:text-destructive">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <form onSubmit={handleSearch} className="flex gap-1.5">
                      <Input
                        placeholder="Search by name, email or phone"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1"
                      />
                      <Button type="button" size="sm" variant="outline" disabled={searching || !searchQuery.trim()} onClick={handleSearch}>
                        {searching ? '...' : 'Search'}
                      </Button>
                    </form>
                    {searchResults.length > 0 && (
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                        {searchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setPickedResult(c);
                              setSearchResults([]);
                            }}
                            className="block w-full px-3 py-2 text-left text-xs hover:bg-accent transition"
                          >
                            <span className="font-bold text-foreground">{c.name}</span>{' '}
                            <span className="text-muted-foreground">{c.email || c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} className="col-span-2" />
                  <Input placeholder="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                  <Input placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/60">
              <Button type="button" variant="outline" onClick={onClose} disabled={resolvingCustomer}>
                Cancel
              </Button>
              <Button type="button" disabled={resolvingCustomer || !canContinueCustomer} className="font-semibold" onClick={handleContinueFromCustomer}>
                {resolvingCustomer ? 'Starting Session...' : 'Emulate & Book in Client Portal →'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
