import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, List } from 'lucide-react';

interface Props {
  dates: string[];
  selectedDate: string | null;
  onPick: (date: string) => void;
  loading: boolean;
  isEmulated?: boolean;
  onMonthYearChange?: (year: number, month: number) => void;
}

function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function MonthYearPicker({
  dates,
  selectedDate,
  onPick,
  loading,
  isEmulated = false,
  onMonthYearChange,
}: Props) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [viewMode, setViewMode] = useState<'calendar' | 'pills'>('calendar');

  const [currentYear, setCurrentYear] = useState<number>(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) return parts[0];
    }
    return now.getFullYear();
  });

  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) return parts[1] - 1;
    }
    return now.getMonth();
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const minYear = now.getFullYear();
  const yearOptions = [minYear, minYear + 1, minYear + 2];

  function updateMonthYear(newYear: number, newMonth: number) {
    let y = newYear;
    let m = newMonth;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setCurrentYear(y);
    setCurrentMonth(m);
    if (onMonthYearChange) {
      onMonthYearChange(y, m);
    }
  }

  function prevMonth() {
    updateMonthYear(currentYear, currentMonth - 1);
  }

  function nextMonth() {
    updateMonthYear(currentYear, currentMonth + 1);
  }

  // Customer: future dates only (date > todayStr)
  // Emulated: current date & future dates (date >= todayStr)
  const allowedDates = dates.filter((d) => (isEmulated ? d >= todayStr : d > todayStr));
  const openDateSet = new Set(allowedDates);

  // Filter allowed dates for the active month & year (used in List mode)
  const listDates = allowedDates.filter((d) => {
    const parts = d.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return false;
    return parts[0] === currentYear && parts[1] === currentMonth + 1;
  });

  const isMinMonth = currentYear <= minYear && currentMonth <= now.getMonth();
  const isMaxMonth = currentYear >= minYear + 2 && currentMonth >= 11;

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
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm font-bold text-foreground">
              Select Appointment Date
            </h3>
            {isEmulated && (
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Staff Emulation Mode
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allowedDates.length > 0
              ? `${allowedDates.length} total open date${allowedDates.length > 1 ? 's' : ''} available`
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

      {/* Month & Year Selector Control Toolbar (Active in both Calendar and List modes) */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-accent/20 border border-border/50 rounded-xl p-2">
        <div className="flex items-center gap-2">
          {/* Month Selector */}
          <select
            value={currentMonth}
            onChange={(e) => updateMonthYear(currentYear, Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground shadow-2xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/40 transition cursor-pointer"
          >
            {monthNames.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={currentYear}
            onChange={(e) => updateMonthYear(Number(e.target.value), currentMonth)}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground shadow-2xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/40 transition cursor-pointer"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Today Shortcut button */}
          {(currentYear !== now.getFullYear() || currentMonth !== now.getMonth()) && (
            <button
              type="button"
              onClick={() => updateMonthYear(now.getFullYear(), now.getMonth())}
              className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
            >
              Today
            </button>
          )}
        </div>

        {/* Prev / Next Month Nav Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isMinMonth}
            onClick={prevMonth}
            className="rounded-lg border border-border bg-card p-1.5 text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
            title="Previous Month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-bold text-foreground px-1.5 min-w-28 text-center">
            {monthNames[currentMonth]} {currentYear}
          </span>
          <button
            type="button"
            disabled={isMaxMonth}
            onClick={nextMonth}
            className="rounded-lg border border-border bg-card p-1.5 text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
            title="Next Month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && allowedDates.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground animate-pulse">
          Loading available dates calendar...
        </div>
      ) : viewMode === 'calendar' ? (
        /* Calendar View */
        <div className="space-y-3 pt-1">
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
        /* List View */
        <div className="space-y-3 pt-1">
          {listDates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {listDates.map((date) => {
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
          ) : (
            <div className="rounded-xl border border-border/70 bg-accent/20 p-6 text-center text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground text-sm">
                No open dates in {monthNames[currentMonth]} {currentYear}
              </p>
              <p>Try picking another month or year using the selector above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
