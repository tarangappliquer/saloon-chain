import { useEffect, useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
  LoadingFallback,
  PageHeader,
} from "@saloon/ui";
import {
  Calendar,
  Clock,
  DoorClosed,
  Layers,
  MapPin,
  Pencil,
  Settings as SettingsIcon,
  Sparkles,
  Store,
} from "lucide-react";
import { adminCatalogApi, ApiError, getFieldError } from "../api/client";
import type { Chain, Location } from "../api/types";
import { TimeInput } from "../components/TimeInput";
import { AddLocationWizard } from "../components/AddLocationWizard";
import { DayScheduleModal } from "../components/DayScheduleModal";
import { ClosuresModal } from "../components/ClosuresModal";
import { weeklyScheduleFromLocation, type DaySchedule } from "../lib/schedule";
import { toApiTime, validateBreakTimes } from "../lib/time";
import { routes } from "../routes";
import { useAuth } from "../features/auth/AuthContext";

type Tab = "business" | "locations" | "service-menu" | "system";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isRootOrSuperAdmin =
    user?.role === "RootSuperAdmin" || user?.role === "SuperAdmin";
  const canEditSaloon = isRootOrSuperAdmin || user?.role === "Admin";

  const [tab, setTab] = useState<Tab>("business");
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isChainEditMode, setIsChainEditMode] = useState(false);
  const [chainForm, setChainForm] = useState({
    name: "",
    breakStartTime: "",
    breakEndTime: "",
  });
  const [chainBreakStartError, setChainBreakStartError] = useState<
    string | null
  >(null);
  const [chainBreakEndError, setChainBreakEndError] = useState<string | null>(
    null,
  );
  const [chainSubmitting, setChainSubmitting] = useState(false);
  const [chainSubmitError, setChainSubmitError] = useState<unknown>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    null,
  );
  const [showAddWizard, setShowAddWizard] = useState(false);

  const [isInfoEditMode, setIsInfoEditMode] = useState(false);
  const [isScheduleEditMode, setIsScheduleEditMode] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(
    null,
  );
  const [deletingLocationBusy, setDeletingLocationBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    address: "",
    latitude: null as number | null,
    longitude: null as number | null,
    timeZoneId: "UTC",
    openTime: "09:00",
    closeTime: "18:00",
    breakStartTime: "",
    breakEndTime: "",
  });

  const [weeklySchedule, setWeeklySchedule] = useState<DaySchedule[]>([]);
  const [showDayScheduleModal, setShowDayScheduleModal] = useState(false);
  const [showClosuresModal, setShowClosuresModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Load Chains
  useEffect(() => {
    adminCatalogApi.apiAdminCatalogChainsGet().then(({ data }) => {
      const cs = data;
      setChains(cs);
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  const activeChain = chains.find((c) => c.id === chainId) ?? null;

  // Sync chain (business detail) form when the active chain changes
  useEffect(() => {
    if (!activeChain) return;
    setChainForm({
      name: activeChain.name,
      breakStartTime: activeChain.breakStartTime
        ? activeChain.breakStartTime.slice(0, 5)
        : "",
      breakEndTime: activeChain.breakEndTime
        ? activeChain.breakEndTime.slice(0, 5)
        : "",
    });
    setIsChainEditMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain?.id]);

  async function handleSaveChain(e: SyntheticEvent) {
    e.preventDefault();
    if (!activeChain) return;

    setError(null);
    setSuccess(null);
    setChainSubmitError(null);
    setChainBreakStartError(null);
    setChainBreakEndError(null);

    const breakErrors = validateBreakTimes(
      chainForm.breakStartTime,
      chainForm.breakEndTime,
    );
    if (breakErrors.startError || breakErrors.endError) {
      setChainBreakStartError(breakErrors.startError);
      setChainBreakEndError(breakErrors.endError);
      return;
    }

    setChainSubmitting(true);
    try {
      const breakStart = toApiTime(chainForm.breakStartTime) ?? '';
      const breakEnd = toApiTime(chainForm.breakEndTime) ?? '';

      await adminCatalogApi.apiAdminCatalogChainsIdPut(activeChain.id, {
        name: chainForm.name,
        breakStartTime: breakStart,
        breakEndTime: breakEnd,
        isActive: activeChain.isActive !== false,
      });

      setChains((cs) =>
        cs.map((c) =>
          c.id === activeChain.id
            ? {
              ...c,
              name: chainForm.name,
              breakStartTime: breakStart,
              breakEndTime: breakEnd,
            }
            : c,
        ),
      );
      setSuccess("Saloon business details updated successfully!");
      setIsChainEditMode(false);
    } catch (err) {
      setChainSubmitError(err);
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to update saloon business details",
      );
    } finally {
      setChainSubmitting(false);
    }
  }

  // Load Locations when Chain changes
  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi.apiAdminCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data;
      setLocations(locs);
      if (locs.length > 0) {
        setLocationId(locs[0].id);
        setSelectedLocation(locs[0]);
      } else {
        setLocationId(null);
        setSelectedLocation(null);
      }
    });
  }, [chainId]);

  function applyLocationToForm(loc: Location) {
    setForm({
      name: loc.name,
      address: loc.address ?? "",
      latitude: loc.latitude ?? null,
      longitude: loc.longitude ?? null,
      timeZoneId: loc.timeZoneId,
      openTime: loc.openTime.slice(0, 5),
      closeTime: loc.closeTime.slice(0, 5),
      breakStartTime: loc.breakStartTime ? loc.breakStartTime.slice(0, 5) : "",
      breakEndTime: loc.breakEndTime ? loc.breakEndTime.slice(0, 5) : "",
    });
    setWeeklySchedule(weeklyScheduleFromLocation(loc));
  }

  // Sync form when selectedLocation changes
  useEffect(() => {
    if (!selectedLocation) return;
    applyLocationToForm(selectedLocation);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  function handleLocationSelect(locId: number) {
    const loc = locations.find((l) => l.id === locId);
    if (loc) {
      setLocationId(loc.id);
      setSelectedLocation(loc);
      setIsInfoEditMode(false);
      setIsScheduleEditMode(false);
    }
  }

  async function handleLocationCreated(newId: number) {
    setShowAddWizard(false);
    if (chainId === null) return;
    const { data } = await adminCatalogApi.apiAdminCatalogLocationsGet(chainId);
    const locs = data;
    setLocations(locs);
    setLocationId(newId);
    setSelectedLocation(locs.find((l) => l.id === newId) ?? null);
    setSuccess("Location created successfully!");
  }

  async function handleConfirmDeleteLocation() {
    if (!deletingLocation || chainId === null) return;
    setError(null);
    setDeletingLocationBusy(true);
    try {
      await adminCatalogApi.apiAdminCatalogLocationsIdDelete(
        deletingLocation.id,
      );
      setDeletingLocation(null);

      const { data } =
        await adminCatalogApi.apiAdminCatalogLocationsGet(chainId);
      const locs = data;
      setLocations(locs);
      const next = locs[0] ?? null;
      setLocationId(next?.id ?? null);
      setSelectedLocation(next);
      setIsInfoEditMode(false);
      setIsScheduleEditMode(false);
      setSuccess("Location deleted successfully!");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to delete location",
      );
    } finally {
      setDeletingLocationBusy(false);
    }
  }

  function toggleDayOpen(bit: number) {
    if (!isScheduleEditMode) return;
    setWeeklySchedule((sched) =>
      sched.map((day) =>
        day.bit === bit ? { ...day, isOpen: !day.isOpen } : day,
      ),
    );
  }

  async function handleSaveLocationSettings(e: SyntheticEvent) {
    e.preventDefault();
    if (!selectedLocation) return;

    setError(null);
    setSuccess(null);
    setSubmitError(null);

    if (form.latitude === null || form.longitude === null) {
      setError("Enter latitude and longitude before saving.");
      return;
    }

    setSubmitting(true);

    try {
      const workingDaysMask = weeklySchedule
        .filter((d) => d.isOpen)
        .reduce((mask, d) => mask | d.bit, 0);

      await adminCatalogApi.apiAdminCatalogLocationsIdPut(selectedLocation.id, {
        name: form.name,
        address: form.address || '',
        latitude: form.latitude,
        longitude: form.longitude,
        openTime: toApiTime(form.openTime)!,
        closeTime: toApiTime(form.closeTime)!,
        breakStartTime: toApiTime(form.breakStartTime) ?? '',
        breakEndTime: toApiTime(form.breakEndTime) ?? '',
        workingDaysMask,
        timeZoneId: form.timeZoneId,
        isActive: selectedLocation.isActive !== false,
      });

      setSuccess("Location details updated successfully!");
      setIsInfoEditMode(false);
      setIsScheduleEditMode(false);
    } catch (err) {
      setSubmitError(err);
      setError(
        err instanceof ApiError ? err.message : "Failed to update location",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deletingLocation !== null}
        title="Delete Location"
        description={`Are you sure you want to delete "${deletingLocation?.name}"? All associated rooms, schedules, and treatment mappings will be permanently removed.`}
        confirmLabel="Delete Location"
        cancelLabel="Keep Location"
        variant="danger"
        loading={deletingLocationBusy}
        onConfirm={handleConfirmDeleteLocation}
        onClose={() => setDeletingLocation(null)}
      />

      <PageHeader
        title="Settings & Location Management"
        description="Configure location details, per-day opening & closing hours, and service menu catalog."
      />

      {/* Tabs */}
      <div className="flex border-b border-border/80 text-xs font-semibold text-muted-foreground gap-6">
        <button
          type="button"
          onClick={() => setTab("business")}
          className={`flex items-center gap-2 pb-3 border-b-2 font-medium transition ${tab === "business"
              ? "border-primary text-primary font-bold"
              : "border-transparent hover:text-foreground"
            }`}
        >
          <Store className="h-4 w-4" />
          Business Detail
        </button>
        <button
          type="button"
          onClick={() => setTab("locations")}
          className={`flex items-center gap-2 pb-3 border-b-2 font-medium transition ${tab === "locations"
              ? "border-primary text-primary font-bold"
              : "border-transparent hover:text-foreground"
            }`}
        >
          <MapPin className="h-4 w-4" />
          Locations & Opening Hours
        </button>
        <button
          type="button"
          onClick={() => setTab("service-menu")}
          className={`flex items-center gap-2 pb-3 border-b-2 font-medium transition ${tab === "service-menu"
              ? "border-primary text-primary font-bold"
              : "border-transparent hover:text-foreground"
            }`}
        >
          <Sparkles className="h-4 w-4" />
          Service Menu Catalog
        </button>
        <button
          type="button"
          onClick={() => setTab("system")}
          className={`flex items-center gap-2 pb-3 border-b-2 font-medium transition ${tab === "system"
              ? "border-primary text-primary font-bold"
              : "border-transparent hover:text-foreground"
            }`}
        >
          <SettingsIcon className="h-4 w-4" />
          Chain & System Settings
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-500">
          ✓ {success}
        </div>
      )}

      {tab === "business" && (
        <div className="space-y-6">
          {isRootOrSuperAdmin && chains.length > 1 && (
            <Card>
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Select Saloon Chain
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Pick a chain to view or edit its business details
                    </p>
                  </div>
                </div>
                <select
                  value={chainId ?? ""}
                  onChange={(e) => setChainId(Number(e.target.value))}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground font-semibold"
                >
                  {chains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          )}

          {!activeChain ? (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                No saloon chain available.
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSaveChain}>
              <Card>
                <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">
                      Saloon Business Details
                    </CardTitle>
                    <Badge
                      status={
                        activeChain.isActive === false ? "Inactive" : "Active"
                      }
                    />
                  </div>
                  {canEditSaloon &&
                    (!isChainEditMode ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsChainEditMode(true)}
                        className="font-semibold"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5 text-primary" />
                        Edit Details
                      </Button>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-500">
                        ✏️ Edit Mode Active
                      </span>
                    ))}
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Input
                      required
                      disabled={!isChainEditMode}
                      label="Saloon Chain Name"
                      value={chainForm.name}
                      onChange={(e) =>
                        setChainForm({ ...chainForm, name: e.target.value })
                      }
                      error={getFieldError(chainSubmitError, "name")}
                    />
                    <TimeInput
                      disabled={!isChainEditMode}
                      label="Default Lunch Break Start (Optional)"
                      value={chainForm.breakStartTime}
                      maxTime={chainForm.breakEndTime || undefined}
                      onChange={(e) => {
                        setChainForm({
                          ...chainForm,
                          breakStartTime: e.target.value,
                        });
                        setChainBreakStartError(null);
                      }}
                      error={chainBreakStartError ?? undefined}
                    />
                    <TimeInput
                      disabled={!isChainEditMode}
                      label="Default Lunch Break End (Optional)"
                      value={chainForm.breakEndTime}
                      minTime={chainForm.breakStartTime || undefined}
                      onChange={(e) => {
                        setChainForm({
                          ...chainForm,
                          breakEndTime: e.target.value,
                        });
                        setChainBreakEndError(null);
                      }}
                      error={chainBreakEndError ?? undefined}
                    />
                  </div>
                </CardContent>
              </Card>

              {isChainEditMode && (
                <div className="flex items-center justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsChainEditMode(false)}
                    disabled={chainSubmitting}
                  >
                    Cancel Edit
                  </Button>
                  <Button
                    type="submit"
                    disabled={chainSubmitting}
                    size="lg"
                    className="font-bold"
                  >
                    {chainSubmitting ? "Saving..." : "Save Business Details"}
                  </Button>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {tab === "locations" && (
        <div className="space-y-6">
          {/* Chain Selector + Add Location Bar */}
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Store className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Locations & Opening Hours
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Select a location below to view or edit its details
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {isRootOrSuperAdmin && chains.length > 1 && (
                  <select
                    value={chainId ?? ""}
                    onChange={(e) => setChainId(Number(e.target.value))}
                    className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground font-semibold"
                  >
                    {chains.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {canEditSaloon && chainId !== null && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowAddWizard(true)}
                    className="font-semibold"
                  >
                    + Add Location
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <CardContent className="py-8">
              <LoadingFallback />
            </CardContent>
          ) : locations.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                No location selected or available.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[260px_1fr] items-start">
              {/* Location List */}
              <Card className="lg:sticky lg:top-4">
                <CardContent className="p-2">
                  <ul className="space-y-1">
                    {locations.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => handleLocationSelect(l.id)}
                          className={`w-full rounded-lg px-3 py-2.5 text-left transition ${l.id === locationId
                              ? "bg-primary/10 border border-primary/30"
                              : "border border-transparent hover:bg-muted/40"
                            }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground truncate">
                              {l.name}
                            </span>
                            <Badge
                              status={
                                l.isActive === false ? "Inactive" : "Active"
                              }
                            />
                          </div>
                          {l.address && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {l.address}
                            </p>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {!selectedLocation ? (
                <Card>
                  <CardContent className="py-8 text-center text-xs text-muted-foreground">
                    No location selected or available.
                  </CardContent>
                </Card>
              ) : (
                <form
                  onSubmit={handleSaveLocationSettings}
                  className="space-y-6"
                >
                  {/* Location General Details */}
                  <Card>
                    <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-sm">
                          Location Info & TimeZone
                        </CardTitle>
                        <Badge
                          status={
                            selectedLocation.isActive === false
                              ? "Inactive"
                              : "Active"
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {!isInfoEditMode ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsInfoEditMode(true)}
                              className="font-semibold"
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1.5 text-primary" />
                              Edit Info
                            </Button>
                            {canEditSaloon && (
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() =>
                                  setDeletingLocation(selectedLocation)
                                }
                              >
                                Delete Location
                              </Button>
                            )}
                          </>
                        ) : (
                          <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-500">
                            ✏️ Edit Mode Active
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Input
                          required
                          disabled={!isInfoEditMode}
                          label="Location Name"
                          placeholder="Downtown Saloon Branch"
                          value={form.name}
                          onChange={(e) =>
                            setForm({ ...form, name: e.target.value })
                          }
                          error={getFieldError(submitError, "name")}
                        />
                        <Input
                          disabled={!isInfoEditMode}
                          label="Address"
                          placeholder="123 Main St, Suite 100"
                          value={form.address}
                          onChange={(e) =>
                            setForm({ ...form, address: e.target.value })
                          }
                          error={getFieldError(submitError, "address")}
                        />
                        <Input
                          required
                          disabled={!isInfoEditMode}
                          label="Time Zone ID"
                          placeholder="UTC or America/New_York"
                          value={form.timeZoneId}
                          onChange={(e) =>
                            setForm({ ...form, timeZoneId: e.target.value })
                          }
                          error={getFieldError(submitError, "timeZoneId")}
                        />
                        <TimeInput
                          required
                          disabled={!isInfoEditMode}
                          label="Default Opening Time"
                          value={form.openTime}
                          maxTime={form.closeTime}
                          onChange={(e) =>
                            setForm({ ...form, openTime: e.target.value })
                          }
                        />
                        <TimeInput
                          required
                          disabled={!isInfoEditMode}
                          label="Default Closing Time"
                          value={form.closeTime}
                          minTime={form.openTime}
                          onChange={(e) =>
                            setForm({ ...form, closeTime: e.target.value })
                          }
                          error={getFieldError(submitError, "closeTime")}
                        />
                        <TimeInput
                          disabled={!isInfoEditMode}
                          label="Break Start Time (Optional)"
                          value={form.breakStartTime}
                          onChange={(e) =>
                            setForm({ ...form, breakStartTime: e.target.value })
                          }
                        />
                        <TimeInput
                          disabled={!isInfoEditMode}
                          label="Break End Time (Optional)"
                          value={form.breakEndTime}
                          onChange={(e) =>
                            setForm({ ...form, breakEndTime: e.target.value })
                          }
                        />
                        <Input
                          required
                          disabled={!isInfoEditMode}
                          type="number"
                          step="any"
                          min={-90}
                          max={90}
                          label="Latitude"
                          placeholder="e.g. 28.613900"
                          value={form.latitude ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              latitude:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          error={getFieldError(submitError, "latitude")}
                        />
                        <Input
                          required
                          disabled={!isInfoEditMode}
                          type="number"
                          step="any"
                          min={-180}
                          max={180}
                          label="Longitude"
                          placeholder="e.g. 77.209000"
                          value={form.longitude ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              longitude:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          error={getFieldError(submitError, "longitude")}
                        />
                      </div>
                      {isInfoEditMode && (
                        <div className="flex items-center justify-end gap-3 pt-2 animate-in fade-in duration-150">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (selectedLocation)
                                applyLocationToForm(selectedLocation);
                              setIsInfoEditMode(false);
                            }}
                            disabled={submitting}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={submitting}
                            className="font-bold"
                          >
                            {submitting ? "Saving..." : "Save Info"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Operating Days -- which days are open at all. Specific hours per day (including
                  future-dated changes) are managed separately below via Day Hours, not here --
                  dbo.Locations only ever stores one default OpenTime/CloseTime pair. */}
                  <Card>
                    <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between flex-wrap gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm">
                            Operating Days
                          </CardTitle>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Which days of the week this location is open. For
                          specific hours per day (including future-dated
                          changes), use Day Hours below.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowClosuresModal(true)}
                        >
                          Holidays
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDayScheduleModal(true)}
                        >
                          Day Hours
                        </Button>
                        {!isScheduleEditMode ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsScheduleEditMode(true)}
                            className="font-semibold"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5 text-primary" />
                            Edit Days
                          </Button>
                        ) : (
                          <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-500">
                            ✏️ Edit Mode Active
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/60 bg-muted/30 font-semibold uppercase text-muted-foreground tracking-wider">
                            <th className="px-6 py-3.5">Day</th>
                            <th className="px-6 py-3.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {weeklySchedule.map((day) => (
                            <tr
                              key={day.key}
                              className={
                                day.isOpen
                                  ? "bg-card"
                                  : "bg-muted/10 opacity-70"
                              }
                            >
                              <td className="px-6 py-4 font-bold text-foreground">
                                {day.label}
                              </td>
                              <td className="px-6 py-4">
                                {isScheduleEditMode ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleDayOpen(day.bit)}
                                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${day.isOpen
                                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                                        : "bg-muted text-muted-foreground border border-border"
                                      }`}
                                  >
                                    {day.isOpen ? "Open" : "Closed"}
                                  </button>
                                ) : (
                                  <span
                                    className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold ${day.isOpen
                                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                                        : "bg-muted text-muted-foreground border border-border"
                                      }`}
                                  >
                                    {day.isOpen ? "Open" : "Closed"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                    {isScheduleEditMode && (
                      <div className="flex items-center justify-end gap-3 p-4 border-t border-border/50 animate-in fade-in duration-150">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (selectedLocation)
                              applyLocationToForm(selectedLocation);
                            setIsScheduleEditMode(false);
                          }}
                          disabled={submitting}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={submitting}
                          className="font-bold"
                        >
                          {submitting ? "Saving..." : "Save Days"}
                        </Button>
                      </div>
                    )}
                  </Card>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {showDayScheduleModal && selectedLocation && (
        <DayScheduleModal
          locationId={selectedLocation.id}
          locationName={selectedLocation.name}
          defaultOpenTime={selectedLocation.openTime}
          defaultCloseTime={selectedLocation.closeTime}
          onClose={() => setShowDayScheduleModal(false)}
        />
      )}

      {showClosuresModal && selectedLocation && (
        <ClosuresModal
          scope={{ kind: "location", id: selectedLocation.id, name: selectedLocation.name }}
          applyToAllChainId={canEditSaloon ? selectedLocation.chainId : undefined}
          applyToAllChainName={activeChain?.name}
          onClose={() => setShowClosuresModal(false)}
        />
      )}

      {showAddWizard && chainId !== null && (
        <AddLocationWizard
          chainId={chainId}
          onClose={() => setShowAddWizard(false)}
          onCreated={handleLocationCreated}
        />
      )}

      {tab === "service-menu" && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card
            className="hover:border-primary/50 transition cursor-pointer"
            onClick={() => navigate(routes.catalog.treatmentCategories)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    Treatment Categories
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Manage service categories (Hair, Nails, Spa)
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Categories →
              </Button>
            </CardContent>
          </Card>

          <Card
            className="hover:border-primary/50 transition cursor-pointer"
            onClick={() =>
              navigate(routes.catalog.treatments(chainId, locationId))
            }
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    Services / Treatments
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Configure service catalog and descriptions
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="primary" size="sm" className="w-full">
                Manage Services →
              </Button>
            </CardContent>
          </Card>

          <Card
            className="hover:border-primary/50 transition cursor-pointer"
            onClick={() =>
              navigate(routes.catalog.treatmentPrices(chainId, locationId))
            }
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    Effective Pricing Rules
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Effective-dated price lists per treatment
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Service Prices →
              </Button>
            </CardContent>
          </Card>

          <Card
            className="hover:border-primary/50 transition cursor-pointer"
            onClick={() =>
              navigate(routes.catalog.treatmentDurations(chainId, locationId))
            }
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Service Durations</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Configure appointment slot durations (15m increments)
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Service Durations →
              </Button>
            </CardContent>
          </Card>

          <Card
            className="hover:border-primary/50 transition cursor-pointer"
            onClick={() => navigate(routes.staff.rooms(chainId, locationId))}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <DoorClosed className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Rooms & Stations</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Setup treatment rooms & station allocations
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Rooms →
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "system" && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-sm">
              Saloon Chain & System Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Active Chain
                </label>
                <p className="font-bold text-foreground text-sm">
                  {chains.find((c) => c.id === chainId)?.name ?? "Saloon Chain"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Default Currency
                </label>
                <p className="font-bold text-foreground text-sm">USD ($)</p>
              </div>
            </div>
            <div className="pt-4 border-t border-border/50 flex flex-wrap gap-3">
              {isRootOrSuperAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(routes.catalog.saloons)}
                >
                  <Store className="h-3.5 w-3.5 mr-1" />
                  Manage Saloon Chains
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(routes.blockTypes)}
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                Manage Block Types
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(routes.appointmentStatuses)}
              >
                <SettingsIcon className="h-3.5 w-3.5 mr-1" />
                Manage Appointment Statuses
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
