"use client";

import { RiCalendarCheckLine } from "@remixicon/react";
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AgendaDaysToShow,
  EventGap,
  EventHeight,
  WeekCellsHeight,
} from "./constants";
import { CalendarDndProvider } from "./calendar-dnd-context";
import { AgendaView } from "./agenda-view";
import {
  formatCalendarDayTitle,
  isCalendarMonthAfter,
  formatCalendarMonthYear,
  formatCalendarShortMonthYear,
  isSameCalendarMonth,
  shiftCalendarMonth,
  type CalendarSystem,
} from "./calendar-system";
import { DayView } from "./day-view";
import { EventDialog } from "./event-dialog";
import { MonthView } from "./month-view";
import type { CalendarEvent, CalendarView } from "./types";
import { WeekView } from "./week-view";
import { addHoursToDate } from "./utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type HolidayContextAction = "MARK_HOLIDAY" | "CLEAR_HOLIDAY";
type SlotContextStatus = "OPEN" | "HELD" | "BLOCKED" | "REMOVE";
type MonthDayStatus =
  | "BOOKED"
  | "AVAILABLE"
  | "FULL"
  | "BLOCKED"
  | "HOLIDAY"
  | "DISABLED"
  | "OUTSIDE"
  | "DEFAULT";

export interface EventCalendarProps {
  events?: CalendarEvent[];
  blockedDates?: string[];
  holidayDates?: string[];
  disabledDates?: string[];
  calendarSystem?: CalendarSystem;
  onCalendarSystemChange?: (calendarSystem: CalendarSystem) => void;
  showCalendarSystemToggle?: boolean;
  onEventAdd?: (event: CalendarEvent) => void;
  onEventUpdate?: (event: CalendarEvent) => void;
  onEventDelete?: (eventId: string) => void;
  onEventSelectReadOnly?: (event: CalendarEvent) => void;
  onHolidayContextAction?: (payload: {
    dateKey: string;
    action: HolidayContextAction;
  }) => void | Promise<void>;
  onSlotContextAction?: (payload: {
    event: CalendarEvent;
    status: SlotContextStatus;
  }) => void | Promise<void>;
  onSlotBookAction?: (payload: { event: CalendarEvent }) => void | Promise<void>;
  monthHideEvents?: boolean;
  monthAvailableDates?: string[];
  monthFullDates?: string[];
  monthBookedDates?: string[];
  monthBookedDayVariant?: "striped" | "solid";
  monthBookedDayLabel?: string;
  monthFullDayTooltip?: string;
  onMonthDaySelect?: (payload: {
    date: Date;
    dateKey: string;
    status: MonthDayStatus;
  }) => void;
  className?: string;
  initialView?: CalendarView;
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  restrictPastNavigation?: boolean;
  allowCreate?: boolean;
  showToolbar?: boolean;
  externalCreateEventName?: string;
  externalCreateEventTarget?: string;
}

export function EventCalendar({
  events = [],
  blockedDates = [],
  holidayDates = [],
  disabledDates = [],
  calendarSystem = "gregorian",
  onCalendarSystemChange,
  showCalendarSystemToggle = false,
  onEventAdd,
  onEventUpdate,
  onEventDelete,
  onEventSelectReadOnly,
  onHolidayContextAction,
  onSlotContextAction,
  onSlotBookAction,
  monthHideEvents = false,
  monthAvailableDates = [],
  monthFullDates = [],
  monthBookedDates = [],
  monthBookedDayVariant = "striped",
  monthBookedDayLabel = "Booked session",
  monthFullDayTooltip,
  onMonthDaySelect,
  className,
  initialView = "month",
  view: controlledView,
  onViewChange,
  currentDate: controlledCurrentDate,
  onCurrentDateChange,
  restrictPastNavigation = false,
  allowCreate = true,
  showToolbar = true,
  externalCreateEventName,
  externalCreateEventTarget,
}: EventCalendarProps) {
  const [uncontrolledCurrentDate, setUncontrolledCurrentDate] = useState(
    new Date(),
  );
  const [uncontrolledView, setUncontrolledView] =
    useState<CalendarView>(initialView);
  const [uncontrolledCalendarSystem, setUncontrolledCalendarSystem] =
    useState<CalendarSystem>(calendarSystem);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const currentDate = controlledCurrentDate ?? uncontrolledCurrentDate;
  const view = controlledView ?? uncontrolledView;
  const activeCalendarSystem = onCalendarSystemChange
    ? calendarSystem
    : uncontrolledCalendarSystem;

  const setCalendarDate = useCallback(
    (nextDate: Date) => {
      if (controlledCurrentDate !== undefined) {
        onCurrentDateChange?.(nextDate);
        return;
      }
      setUncontrolledCurrentDate(nextDate);
    },
    [controlledCurrentDate, onCurrentDateChange],
  );

  const setCalendarView = useCallback(
    (nextView: CalendarView) => {
      if (controlledView !== undefined) {
        onViewChange?.(nextView);
        return;
      }
      setUncontrolledView(nextView);
      onViewChange?.(nextView);
    },
    [controlledView, onViewChange],
  );

  const setSystem = useCallback(
    (nextSystem: CalendarSystem) => {
      if (onCalendarSystemChange) {
        onCalendarSystemChange(nextSystem);
        return;
      }

      setUncontrolledCalendarSystem(nextSystem);
    },
    [onCalendarSystemChange],
  );

  // Add keyboard shortcuts for view switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea or contentEditable element
      // or if the event dialog is open
      if (
        isEventDialogOpen ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "m":
          setCalendarView("month");
          break;
        case "w":
          setCalendarView("week");
          break;
        case "d":
          setCalendarView("day");
          break;
        case "a":
          setCalendarView("agenda");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEventDialogOpen, setCalendarView]);

  useEffect(() => {
    if (!externalCreateEventName || !allowCreate) return;

    const handleExternalCreate = (event: Event) => {
      const customEvent = event as CustomEvent<{ target?: string }>;
      const target = customEvent.detail?.target;

      if (externalCreateEventTarget && target !== externalCreateEventTarget) {
        return;
      }

      setSelectedEvent(null);
      setIsEventDialogOpen(true);
    };

    window.addEventListener(externalCreateEventName, handleExternalCreate);
    return () =>
      window.removeEventListener(externalCreateEventName, handleExternalCreate);
  }, [allowCreate, externalCreateEventName, externalCreateEventTarget]);

  const canNavigatePrevious = useMemo(() => {
    if (!restrictPastNavigation) return true;

    const today = new Date();
    if (view === "month") {
      return isCalendarMonthAfter(currentDate, today, activeCalendarSystem);
    }
    if (view === "week") {
      return (
        startOfWeek(currentDate, { weekStartsOn: 0 }) >
        startOfWeek(today, { weekStartsOn: 0 })
      );
    }
    if (view === "day") {
      return startOfDay(currentDate) > startOfDay(today);
    }
    return startOfDay(currentDate) > startOfDay(today);
  }, [activeCalendarSystem, currentDate, restrictPastNavigation, view]);

  const handlePrevious = () => {
    if (!canNavigatePrevious) return;

    if (view === "month") {
      setCalendarDate(
        shiftCalendarMonth(currentDate, -1, activeCalendarSystem),
      );
    } else if (view === "week") {
      setCalendarDate(subWeeks(currentDate, 1));
    } else if (view === "day") {
      setCalendarDate(addDays(currentDate, -1));
    } else if (view === "agenda") {
      // For agenda view, go back 30 days (a full month)
      setCalendarDate(addDays(currentDate, -AgendaDaysToShow));
    }
  };

  const handleNext = () => {
    if (view === "month") {
      setCalendarDate(
        shiftCalendarMonth(currentDate, 1, activeCalendarSystem),
      );
    } else if (view === "week") {
      setCalendarDate(addWeeks(currentDate, 1));
    } else if (view === "day") {
      setCalendarDate(addDays(currentDate, 1));
    } else if (view === "agenda") {
      // For agenda view, go forward 30 days (a full month)
      setCalendarDate(addDays(currentDate, AgendaDaysToShow));
    }
  };

  const handleToday = () => {
    setCalendarDate(new Date());
  };

  const handleEventSelect = (event: CalendarEvent) => {
    if (!allowCreate) {
      onEventSelectReadOnly?.(event);
      return;
    }
    setSelectedEvent(event);
    setIsEventDialogOpen(true);
  };

  const handleEventCreate = (startTime: Date) => {
    if (!allowCreate) return;

    // Snap to 15-minute intervals
    const minutes = startTime.getMinutes();
    const remainder = minutes % 15;
    if (remainder !== 0) {
      if (remainder < 7.5) {
        // Round down to nearest 15 min
        startTime.setMinutes(minutes - remainder);
      } else {
        // Round up to nearest 15 min
        startTime.setMinutes(minutes + (15 - remainder));
      }
      startTime.setSeconds(0);
      startTime.setMilliseconds(0);
    }

    const newEvent: CalendarEvent = {
      allDay: false,
      end: addHoursToDate(startTime, 1),
      id: "",
      start: startTime,
      title: "",
    };
    setSelectedEvent(newEvent);
    setIsEventDialogOpen(true);
  };

  const handleEventSave = (event: CalendarEvent) => {
    if (!allowCreate) return;
    if (event.id) {
      onEventUpdate?.(event);
      // Show toast notification when an event is updated
      toast(`Event "${event.title}" updated`, {
        description: format(new Date(event.start), "MMM d, yyyy"),
        position: "bottom-left",
      });
    } else {
      onEventAdd?.({
        ...event,
        id: Math.random().toString(36).substring(2, 11),
      });
      // Show toast notification when an event is added
      toast(`Event "${event.title}" added`, {
        description: format(new Date(event.start), "MMM d, yyyy"),
        position: "bottom-left",
      });
    }
    setIsEventDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleEventDelete = (eventId: string) => {
    if (!allowCreate) return;
    const deletedEvent = events.find((e) => e.id === eventId);
    onEventDelete?.(eventId);
    setIsEventDialogOpen(false);
    setSelectedEvent(null);

    // Show toast notification when an event is deleted
    if (deletedEvent) {
      toast(`Event "${deletedEvent.title}" deleted`, {
        description: format(new Date(deletedEvent.start), "MMM d, yyyy"),
        position: "bottom-left",
      });
    }
  };

  const handleEventUpdate = (updatedEvent: CalendarEvent) => {
    if (!allowCreate) return;
    onEventUpdate?.(updatedEvent);

    // Show toast notification when an event is updated via drag and drop
    toast(`Event "${updatedEvent.title}" moved`, {
      description: format(new Date(updatedEvent.start), "MMM d, yyyy"),
      position: "bottom-left",
    });
  };

  const viewTitle = useMemo(() => {
    if (view === "month") {
      return formatCalendarMonthYear(currentDate, activeCalendarSystem);
    }
    if (view === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      if (isSameCalendarMonth(start, end, activeCalendarSystem)) {
        return formatCalendarMonthYear(start, activeCalendarSystem);
      }
      return `${formatCalendarShortMonthYear(
        start,
        activeCalendarSystem,
      )} - ${formatCalendarShortMonthYear(end, activeCalendarSystem)}`;
    }
    if (view === "day") {
      if (activeCalendarSystem === "nepali") {
        return formatCalendarDayTitle(currentDate, activeCalendarSystem);
      }

      return (
        <>
          <span aria-hidden="true" className="min-[480px]:hidden">
            {format(currentDate, "MMM d, yyyy")}
          </span>
          <span aria-hidden="true" className="max-[479px]:hidden min-md:hidden">
            {format(currentDate, "MMMM d, yyyy")}
          </span>
          <span className="max-md:hidden">
            {format(currentDate, "EEE MMMM d, yyyy")}
          </span>
        </>
      );
    }
    if (view === "agenda") {
      // Show the month range for agenda view
      const start = currentDate;
      const end = addDays(currentDate, AgendaDaysToShow - 1);

      if (isSameCalendarMonth(start, end, activeCalendarSystem)) {
        return formatCalendarMonthYear(start, activeCalendarSystem);
      }
      return `${formatCalendarShortMonthYear(
        start,
        activeCalendarSystem,
      )} - ${formatCalendarShortMonthYear(end, activeCalendarSystem)}`;
    }
    return formatCalendarMonthYear(currentDate, activeCalendarSystem);
  }, [activeCalendarSystem, currentDate, view]);

  return (
    <div
      className={cn(
        "font-at-aero-regular flex flex-col has-data-[slot=month-view]:flex-1",
        !showToolbar && className,
      )}
      style={
        {
          "--event-gap": `${EventGap}px`,
          "--event-height": `${EventHeight}px`,
          "--week-cells-height": `${WeekCellsHeight}px`,
        } as React.CSSProperties
      }
    >
      <CalendarDndProvider onEventUpdate={handleEventUpdate}>
        {showToolbar && (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 p-2 sm:p-4",
              className,
            )}
          >
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center sm:gap-2">
                <Button
                  aria-label="Previous"
                  disabled={!canNavigatePrevious}
                  onClick={handlePrevious}
                  size="icon"
                  variant="ghost"
                >
                  <ChevronLeftIcon aria-hidden="true" size={16} />
                </Button>
                <Button
                  aria-label="Next"
                  onClick={handleNext}
                  size="icon"
                  variant="ghost"
                >
                  <ChevronRightIcon aria-hidden="true" size={16} />
                </Button>
              </div>
              <h2 className="font-cormorant text-xl leading-none sm:text-2xl md:text-3xl">
                {viewTitle}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="max-[479px]:aspect-square max-[479px]:p-0!"
                onClick={handleToday}
                variant="outline"
              >
                <RiCalendarCheckLine
                  aria-hidden="true"
                  className="min-[480px]:hidden"
                  size={16}
                />
                <span className="max-[479px]:sr-only">Today</span>
              </Button>
              {showCalendarSystemToggle && (
                <ToggleGroup
                  aria-label="Calendar system"
                  onValueChange={(value) => {
                    if (value === "gregorian" || value === "nepali") {
                      setSystem(value);
                    }
                  }}
                  size="sm"
                  type="single"
                  value={activeCalendarSystem}
                  variant="outline"
                >
                  <ToggleGroupItem aria-label="Gregorian (AD)" value="gregorian">
                    AD
                  </ToggleGroupItem>
                  <ToggleGroupItem aria-label="Nepali (BS)" value="nepali">
                    BS
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="gap-1.5 max-[479px]:h-8" variant="outline">
                    <span>
                      <span aria-hidden="true" className="min-[480px]:hidden">
                        {view.charAt(0).toUpperCase()}
                      </span>
                      <span className="max-[479px]:sr-only">
                        {view.charAt(0).toUpperCase() + view.slice(1)}
                      </span>
                    </span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="-me-1 opacity-60"
                      size={16}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-32">
                  <DropdownMenuItem onClick={() => setCalendarView("month")}>
                    Month <DropdownMenuShortcut>M</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCalendarView("week")}>
                    Week <DropdownMenuShortcut>W</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCalendarView("day")}>
                    Day <DropdownMenuShortcut>D</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCalendarView("agenda")}>
                    Agenda <DropdownMenuShortcut>A</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {allowCreate && (
                <Button
                  className="max-[479px]:aspect-square max-[479px]:p-0!"
                  onClick={() => {
                    setSelectedEvent(null); // Ensure we're creating a new event
                    setIsEventDialogOpen(true);
                  }}
                  size="sm"
                  type="button"
                >
                  <PlusIcon
                    aria-hidden="true"
                    className="sm:-ms-1 opacity-60"
                    size={16}
                  />
                  <span className="max-sm:sr-only">New event</span>
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col">
          {view === "month" && (
            <MonthView
              blockedDates={blockedDates}
              calendarSystem={activeCalendarSystem}
              currentDate={currentDate}
              disabledDates={disabledDates}
              availableDates={monthAvailableDates}
              events={events}
              fullDates={monthFullDates}
              bookedDates={monthBookedDates}
              bookedDayVariant={monthBookedDayVariant}
              bookedDayLabel={monthBookedDayLabel}
              fullDayTooltip={monthFullDayTooltip}
              hideEvents={monthHideEvents}
              holidayDates={holidayDates}
              onEventCreate={handleEventCreate}
              onEventSelect={handleEventSelect}
              onHolidayContextAction={onHolidayContextAction}
              onSlotBookAction={onSlotBookAction}
              onSlotContextAction={onSlotContextAction}
              onDaySelect={onMonthDaySelect}
            />
          )}
          {view === "week" && (
            <WeekView
              blockedDates={blockedDates}
              calendarSystem={activeCalendarSystem}
              currentDate={currentDate}
              disabledDates={disabledDates}
              events={events}
              holidayDates={holidayDates}
              onEventCreate={handleEventCreate}
              onEventSelect={handleEventSelect}
              onHolidayContextAction={onHolidayContextAction}
              onSlotBookAction={onSlotBookAction}
              onSlotContextAction={onSlotContextAction}
            />
          )}
          {view === "day" && (
            <DayView
              blockedDates={blockedDates}
              calendarSystem={activeCalendarSystem}
              currentDate={currentDate}
              disabledDates={disabledDates}
              events={events}
              holidayDates={holidayDates}
              onEventCreate={handleEventCreate}
              onEventSelect={handleEventSelect}
              onHolidayContextAction={onHolidayContextAction}
              onSlotBookAction={onSlotBookAction}
              onSlotContextAction={onSlotContextAction}
            />
          )}
          {view === "agenda" && (
            <AgendaView
              currentDate={currentDate}
              events={events}
              onEventSelect={handleEventSelect}
            />
          )}
        </div>

        <EventDialog
          key={`${isEventDialogOpen ? "open" : "closed"}-${selectedEvent?.id ?? "new"}-${selectedEvent ? new Date(selectedEvent.start).getTime() : "none"}`}
          event={selectedEvent}
          isOpen={isEventDialogOpen}
          onClose={() => {
            setIsEventDialogOpen(false);
            setSelectedEvent(null);
          }}
          onDelete={handleEventDelete}
          onSave={handleEventSave}
        />
      </CalendarDndProvider>
    </div>
  );
}
