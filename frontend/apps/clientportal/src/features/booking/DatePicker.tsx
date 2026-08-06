import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, List } from 'lucide-react';

interface Props {
  dates: string[];
  selectedDate: string | null;
  onPick: (date: string) => void;
  loading: boolean;
  isEmulated?: boolean;
}

function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function DatePicker({ dates, selectedDate, onPick, loading, isEmulated = false }: Props) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Customer: future dates only (date > todayStr)
  // Emulated: current date & future dates (date >= todayStr)
  const allowedDates = dates.filter((d) => (isEmulated ? d >= todayStr : d > todayStr));
  const openDateSet = new Set(allowedDates);

  const [viewMode, setViewMode] = useState<'calendar' | 'pills'>('calendar');
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth()); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  // Calendar Grid Math
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const startDayOffset = (firstDayOfMonth.getDay() + 6) % 7; // Mon=0..Sun=6
  const daysInMonth = lastDayOfMonth.getDate();

  const calendarCells: ({ dateStr: string; dayNum: number } | null)[] = [];
  for (let i = 0; i < startDayOffset; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${currentYear}-${mm}-${dd}`;
    calendarCells.push({ dateStr, dayNum: d });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm font-bold text-foreground">
              Select Appointment Date
            </h3>
            {isEmulated && (
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Staff Emulation Mode (Today Included)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allowedDates.length > 0
              ? `${allowedDates.length} opened date${allowedDates.length > 1 ? 's' : ''} available`
              : 'No available open dates found for this saloon location.'}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-accent/30 p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
              viewMode === 'calendar'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Calendar</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pills')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
              viewMode === 'pills'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>List</span>
          </button>
        </div>
      </div>

      {loading && allowedDates.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground animate-pulse">
          Loading available dates calendar...
        </div>
      ) : allowedDates.length === 0 ? (
        <div className="rounded-xl border border-border/70 bg-accent/20 p-6 text-center text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm">No Open Dates Available</p>
          <p>This saloon currently has no open room slots or dates scheduled in the upcoming window.</p>
        </div>
      ) : viewMode === 'calendar' ? (
        /* Modern Month Calendar Grid */
        <div className="space-y-3 pt-1">
          {/* Month Navigation */}
          <div className="flex items-center justify-between px-1">
            <span className="font-display text-sm font-extrabold text-foreground">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-lg border border-border p-1.5 text-foreground hover:bg-accent transition cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-lg border border-border p-1.5 text-foreground hover:bg-accent transition cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase text-muted-foreground tracking-wider border-b border-border/40 pb-1.5">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="h-11 rounded-lg bg-transparent" />;
              }

              const { dateStr, dayNum } = cell;
              const isOpen = openDateSet.has(dateStr);
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={!isOpen}
                  onClick={() => onPick(dateStr)}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-xl border text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground font-bold shadow-md scale-105 ring-2 ring-primary/40'
                      : isOpen
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground hover:border-primary hover:bg-primary/10 shadow-2xs font-bold'
                        : 'border-border/30 bg-card/40 text-muted-foreground/30 cursor-not-allowed opacity-40'
                  }`}
                >
                  <span>{dayNum}</span>
                  {isOpen && !isSelected && (
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                  {isToday && !isSelected && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500" title="Today" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-2 border-t border-border/40">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>Available Date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span>Selected Date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span>Closed / Unavailable</span>
            </div>
          </div>
        </div>
      ) : (
        /* Compact List/Pill View */
        <div className="flex flex-wrap gap-2 pt-1">
          {allowedDates.map((date) => {
            const isSelected = selectedDate === date;
            return (
              <button
                key={date}
                type="button"
                disabled={loading}
                onClick={() => onPick(date)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer disabled:opacity-40 ${
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs font-bold'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-foreground hover:border-primary/50 hover:bg-accent font-semibold'
                }`}
              >
                {formatDateLabel(date)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
