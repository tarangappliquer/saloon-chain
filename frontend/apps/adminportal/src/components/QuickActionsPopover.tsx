interface QuickActionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
  timeDisplay: string;
  onAddAppointment: () => void;
  onAddGroupAppointment: () => void;
  onAddBlockedTime: () => void;
}

export function QuickActionsPopover({
  isOpen,
  onClose,
  position,
  timeDisplay,
  onAddAppointment,
  onAddGroupAppointment: _onAddGroupAppointment,
  onAddBlockedTime,
}: QuickActionsPopoverProps) {
  if (!isOpen || !position) return null;

  return (
    <div
      className="fixed z-50 w-80 rounded-2xl border border-border/80 bg-card shadow-2xl p-4 space-y-2.5 text-left"
      style={{
        left: Math.min(position.x, window.innerWidth - 340),
        top: Math.min(position.y, window.innerHeight - 260),
      }}
    >
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5 px-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-sm font-extrabold text-foreground">{timeDisplay}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1.5 pt-1">
        <button
          type="button"
          onClick={() => {
            onClose();
            onAddAppointment();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-foreground hover:bg-accent transition cursor-pointer"
        >
          <span className="text-lg">📅</span>
          <span>Add appointment</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onAddBlockedTime();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-foreground hover:bg-accent transition cursor-pointer"
        >
          <span className="text-lg">✖️</span>
          <span>Add blocked time</span>
        </button>
      </div>
    </div>
  );
}
