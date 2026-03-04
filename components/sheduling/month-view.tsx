"use client";

import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from "date-fns";
import type React from "react";
import { useMemo } from "react";

import { DefaultStartHour, EventGap, EventHeight } from "@/components/sheduling/constants";
import { useEventVisibility } from "@/hooks/use-event-visibility";
import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventItem } from "./event-item";
import {
  type CalendarSystem,
  formatCalendarDayNumber,
  formatCalendarWeekday,
  getCalendarMonthBounds,
  isSameCalendarMonth,
} from "./calendar-system";
import type { CalendarEvent } from "./types";
import {
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
  sortEvents,
} from "./utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HolidayContextAction = "MARK_HOLIDAY" | "CLEAR_HOLIDAY";

interface MonthViewProps {
  blockedDates?: string[];
  holidayDates?: string[];
  disabledDates?: string[];
  availableDates?: string[];
  fullDates?: string[];
  bookedDates?: string[];
  bookedDayVariant?: "striped" | "solid";
  bookedDayLabel?: string;
  hideEvents?: boolean;
  fullDayTooltip?: string;
  calendarSystem?: CalendarSystem;
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  onHolidayContextAction?: (payload: {
    dateKey: string;
    action: HolidayContextAction;
  }) => void | Promise<void>;
  onSlotContextAction?: (payload: {
    event: CalendarEvent;
    status: "OPEN" | "HELD" | "BLOCKED" | "REMOVE";
  }) => void | Promise<void>;
  onSlotBookAction?: (payload: { event: CalendarEvent }) => void | Promise<void>;
  onDaySelect?: (payload: {
    date: Date;
    dateKey: string;
    status:
      | "BOOKED"
      | "AVAILABLE"
      | "FULL"
      | "BLOCKED"
      | "HOLIDAY"
      | "DISABLED"
      | "OUTSIDE"
      | "DEFAULT";
  }) => void;
}

export function MonthView({
  blockedDates = [],
  holidayDates = [],
  disabledDates = [],
  availableDates = [],
  fullDates = [],
  bookedDates = [],
  bookedDayVariant = "striped",
  bookedDayLabel = "Booked session",
  hideEvents = false,
  fullDayTooltip = "All slots are fully booked for this day.",
  calendarSystem = "gregorian",
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  onHolidayContextAction,
  onSlotContextAction,
  onSlotBookAction,
  onDaySelect,
}: MonthViewProps) {
  const blockedDateSet = useMemo(() => new Set(blockedDates), [blockedDates]);
  const holidayDateSet = useMemo(() => new Set(holidayDates), [holidayDates]);
  const disabledDateSet = useMemo(() => new Set(disabledDates), [disabledDates]);
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const fullDateSet = useMemo(() => new Set(fullDates), [fullDates]);
  const bookedDateSet = useMemo(() => new Set(bookedDates), [bookedDates]);

  const days = useMemo(() => {
    const { monthStart, monthEnd } = getCalendarMonthBounds(
      currentDate,
      calendarSystem,
    );
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ end: calendarEnd, start: calendarStart });
  }, [calendarSystem, currentDate]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), i);
      return formatCalendarWeekday(date, calendarSystem);
    });
  }, [calendarSystem]);

  const weeks = useMemo(() => {
    const result = [];
    let week = [];

    for (let i = 0; i < days.length; i++) {
      week.push(days[i]);
      if (week.length === 7 || i === days.length - 1) {
        result.push(week);
        week = [];
      }
    }

    return result;
  }, [days]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const { contentRef, getVisibleEventCount } = useEventVisibility({
    eventGap: EventGap,
    eventHeight: EventHeight,
  });

  return (
    <TooltipProvider delayDuration={120}>
      <div className="contents" data-slot="month-view">
      <div className="grid grid-cols-7 border-border/70 border-b">
        {weekdays.map((day) => (
          <div
            className="py-2 text-center text-muted-foreground/70 text-sm"
            key={day}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr">
        {weeks.map((week, weekIndex) => (
          <div
            className="grid grid-cols-7 [&:last-child>*]:border-b-0"
            key={`week-${week}`}
          >
            {week.map((day, dayIndex) => {
              if (!day) return null; // Skip if day is undefined

              const dayEvents = getEventsForDay(events, day);
              const spanningEvents = getSpanningEventsForDay(events, day);
              const dateKey = format(day, "yyyy-MM-dd");
              const isCurrentMonth = isSameCalendarMonth(
                day,
                currentDate,
                calendarSystem,
              );
              const isBlockedDay = blockedDateSet.has(dateKey);
              const isManagedHoliday = holidayDateSet.has(dateKey);
              const isDisabledDay = disabledDateSet.has(dateKey);
              const isAvailableDay = availableDateSet.has(dateKey);
              const isFullDay = fullDateSet.has(dateKey);
              const isBookedDay = bookedDateSet.has(dateKey);
              const dayStatus =
                !isCurrentMonth
                  ? ("OUTSIDE" as const)
                  : isDisabledDay
                    ? ("DISABLED" as const)
                  : isManagedHoliday
                    ? ("HOLIDAY" as const)
                    : isBlockedDay
                      ? ("BLOCKED" as const)
                      : isBookedDay
                        ? ("BOOKED" as const)
                        : isAvailableDay
                          ? ("AVAILABLE" as const)
                          : isFullDay
                            ? ("FULL" as const)
                            : ("DEFAULT" as const);
              const hideDayEvents =
                hideEvents || (isCurrentMonth && !isDisabledDay && isBookedDay);
              const cellId = `month-cell-${day.toISOString()}`;
              const allDayEvents = [...spanningEvents, ...dayEvents];
              const allEvents = getAllEventsForDay(events, day);

              const isReferenceCell = weekIndex === 0 && dayIndex === 0;
              const visibleCount = getVisibleEventCount(allDayEvents.length);
              const hasMore = allDayEvents.length > visibleCount;
              const remainingCount = hasMore
                ? allDayEvents.length - visibleCount
                : 0;

              const cellContent = (
                <DroppableCell
                  date={day}
                  id={cellId}
                  onClick={() => {
                    if (onDaySelect) {
                      onDaySelect({
                        date: day,
                        dateKey,
                        status: dayStatus,
                      });
                      return;
                    }
                    if (!isCurrentMonth || isBlockedDay || isDisabledDay) return;
                    const startTime = new Date(day);
                    startTime.setHours(DefaultStartHour, 0, 0);
                    onEventCreate(startTime);
                  }}
                >
                  <div className="mt-1 inline-flex size-6 items-center justify-center rounded-full text-sm group-data-today:bg-primary group-data-today:text-primary-foreground">
                    {formatCalendarDayNumber(day, calendarSystem)}
                  </div>
                  <div
                    className="min-h-[calc((var(--event-height)+var(--event-gap))*2)] sm:min-h-[calc((var(--event-height)+var(--event-gap))*3)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*4)]"
                    ref={isReferenceCell ? contentRef : null}
                  >
                    {hideDayEvents &&
                      isCurrentMonth &&
                      isBookedDay &&
                      bookedDayLabel && (
                        <div className="mt-(--event-gap) px-1 text-[10px] text-emerald-900/85 sm:px-2 sm:text-xs dark:text-emerald-100/85">
                          {bookedDayLabel}
                        </div>
                      )}
                    {!hideDayEvents &&
                      sortEvents(allDayEvents).map((event, index) => {
                      const eventStart = new Date(event.start);
                      const eventEnd = new Date(event.end);
                      const isFirstDay = isSameDay(day, eventStart);
                      const isLastDay = isSameDay(day, eventEnd);

                      const isHidden = index >= visibleCount;

                      if (!visibleCount) return null;

                      const slotStatus = event.slotStatus;
                      const isSlotActionBlocked =
                        isBlockedDay || isManagedHoliday || isDisabledDay;
                      const slotId = event.slotId;
                      const hasSlotOptions = Boolean(
                        event.slotOptions && event.slotOptions.length > 0,
                      );
                      const isSlotEvent = Boolean(slotId);
                      const effectiveSlotStatus =
                        slotStatus ??
                        (slotId || hasSlotOptions
                          ? ("OPEN" as const)
                          : undefined);
                      const bookableContextEnabled =
                        !isSlotActionBlocked &&
                        Boolean(onSlotBookAction) &&
                        (Boolean(slotId) || hasSlotOptions) &&
                        effectiveSlotStatus === "OPEN";
                      const slotContextMenuEnabled =
                        !isSlotActionBlocked &&
                        Boolean(onSlotContextAction) &&
                        Boolean(slotId);
                      const canUpdateSlotStatus = effectiveSlotStatus !== "BOOKED";

                      const eventNode = isSlotEvent ? (
                        <EventItem
                          event={event}
                          isFirstDay={isFirstDay}
                          isLastDay={isLastDay}
                          onClick={(e) => handleEventClick(event, e)}
                          view="month"
                        />
                      ) : !isFirstDay ? (
                        <EventItem
                          event={event}
                          isFirstDay={isFirstDay}
                          isLastDay={isLastDay}
                          onClick={(e) => handleEventClick(event, e)}
                          view="month"
                        >
                          <div aria-hidden={true} className="invisible">
                            {!event.allDay && (
                              <span>
                                {format(
                                  new Date(event.start),
                                  "h:mm",
                                )}{" "}
                              </span>
                            )}
                            {event.title}
                          </div>
                        </EventItem>
                      ) : (
                        <DraggableEvent
                          event={event}
                          isFirstDay={isFirstDay}
                          isLastDay={isLastDay}
                          onClick={(e) => handleEventClick(event, e)}
                          view="month"
                        />
                      );

                      return (
                        <div
                          aria-hidden={isHidden ? "true" : undefined}
                          className="aria-hidden:hidden"
                          key={
                            isFirstDay
                              ? event.id
                              : `spanning-${event.id}-${day.toISOString().slice(0, 10)}`
                          }
                        >
                          {bookableContextEnabled ? (
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <div>
                                  {eventNode}
                                </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuLabel>{event.title}</ContextMenuLabel>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onSelect={() =>
                                    void onSlotBookAction?.({
                                      event,
                                    })
                                  }
                                >
                                  Book Appointment
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          ) : slotContextMenuEnabled ? (
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <div>
                                  {eventNode}
                                </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuLabel>{event.title}</ContextMenuLabel>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  disabled={!canUpdateSlotStatus || effectiveSlotStatus === "OPEN"}
                                  onSelect={() =>
                                    void onSlotContextAction?.({
                                      event: { ...event, slotId },
                                      status: "OPEN",
                                    })
                                  }
                                >
                                  Set Open
                                </ContextMenuItem>
                                <ContextMenuItem
                                  disabled={!canUpdateSlotStatus || effectiveSlotStatus === "HELD"}
                                  onSelect={() =>
                                    void onSlotContextAction?.({
                                      event: { ...event, slotId },
                                      status: "HELD",
                                    })
                                  }
                                >
                                  Set Reserved
                                </ContextMenuItem>
                                <ContextMenuItem
                                  disabled={!canUpdateSlotStatus || effectiveSlotStatus === "BLOCKED"}
                                  onSelect={() =>
                                    void onSlotContextAction?.({
                                      event: { ...event, slotId },
                                      status: "BLOCKED",
                                    })
                                  }
                                >
                                  Set Blocked
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  disabled={!canUpdateSlotStatus}
                                  onSelect={() =>
                                    void onSlotContextAction?.({
                                      event: { ...event, slotId },
                                      status: "REMOVE",
                                    })
                                  }
                                >
                                  Remove Slot
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          ) : (
                            eventNode
                          )}
                        </div>
                      );
                    })}

                    {!hideDayEvents && hasMore && (
                      <Popover modal>
                        <PopoverTrigger asChild>
                          <button
                            className="mt-(--event-gap) flex h-(--event-height) w-full select-none items-center overflow-hidden px-1 text-left text-[10px] text-muted-foreground outline-none backdrop-blur-md transition hover:bg-muted/50 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-2 sm:text-xs"
                            onClick={(e) => e.stopPropagation()}
                            type="button"
                          >
                            <span>
                              + {remainingCount}{" "}
                              <span className="max-sm:sr-only">more</span>
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="center"
                          className="max-w-52 p-3"
                          style={
                            {
                              "--event-height": `${EventHeight}px`,
                            } as Record<string, string>
                          }
                        >
                          <div className="space-y-2">
                            <div className="font-medium text-sm">
                              {calendarSystem === "nepali"
                                ? `${formatCalendarWeekday(
                                    day,
                                    calendarSystem,
                                  )} ${formatCalendarDayNumber(
                                    day,
                                    calendarSystem,
                                  )}`
                                : format(day, "EEE d")}
                            </div>
                            <div className="space-y-1">
                              {sortEvents(allEvents).map((event) => {
                                const eventStart = new Date(event.start);
                                const eventEnd = new Date(event.end);
                                const isFirstDay = isSameDay(day, eventStart);
                                const isLastDay = isSameDay(day, eventEnd);
                                const slotStatus = event.slotStatus;
                                const slotId = event.slotId;
                                const hasSlotOptions = Boolean(
                                  event.slotOptions &&
                                    event.slotOptions.length > 0,
                                );
                                const effectiveSlotStatus =
                                  slotStatus ??
                                  (slotId || hasSlotOptions
                                    ? ("OPEN" as const)
                                    : undefined);
                                const isSlotActionBlocked =
                                  isBlockedDay || isManagedHoliday || isDisabledDay;
                                const bookableContextEnabled =
                                  !isSlotActionBlocked &&
                                  Boolean(onSlotBookAction) &&
                                  (Boolean(slotId) || hasSlotOptions) &&
                                  effectiveSlotStatus === "OPEN";
                                const slotContextMenuEnabled =
                                  !isSlotActionBlocked &&
                                  Boolean(onSlotContextAction) &&
                                  Boolean(slotId);
                                const canUpdateSlotStatus = effectiveSlotStatus !== "BOOKED";

                                const eventNode = (
                                  <EventItem
                                    event={event}
                                    isFirstDay={isFirstDay}
                                    isLastDay={isLastDay}
                                    key={event.id}
                                    onClick={(e) =>
                                      handleEventClick(event, e)
                                    }
                                    view="month"
                                  />
                                );

                                if (bookableContextEnabled) {
                                  return (
                                    <ContextMenu key={event.id}>
                                      <ContextMenuTrigger asChild>
                                        <div>
                                          {eventNode}
                                        </div>
                                      </ContextMenuTrigger>
                                      <ContextMenuContent>
                                        <ContextMenuLabel>{event.title}</ContextMenuLabel>
                                        <ContextMenuSeparator />
                                        <ContextMenuItem
                                          onSelect={() =>
                                            void onSlotBookAction?.({
                                              event,
                                            })
                                          }
                                        >
                                          Book Appointment
                                        </ContextMenuItem>
                                      </ContextMenuContent>
                                    </ContextMenu>
                                  );
                                }

                                if (slotContextMenuEnabled) {
                                  return (
                                    <ContextMenu key={event.id}>
                                      <ContextMenuTrigger asChild>
                                        <div>
                                          {eventNode}
                                        </div>
                                      </ContextMenuTrigger>
                                      <ContextMenuContent>
                                        <ContextMenuLabel>{event.title}</ContextMenuLabel>
                                        <ContextMenuSeparator />
                                        <ContextMenuItem
                                          disabled={!canUpdateSlotStatus || effectiveSlotStatus === "OPEN"}
                                          onSelect={() =>
                                            void onSlotContextAction?.({
                                              event: { ...event, slotId },
                                              status: "OPEN",
                                            })
                                          }
                                        >
                                          Set Open
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                          disabled={!canUpdateSlotStatus || effectiveSlotStatus === "HELD"}
                                          onSelect={() =>
                                            void onSlotContextAction?.({
                                              event: { ...event, slotId },
                                              status: "HELD",
                                            })
                                          }
                                        >
                                          Set Reserved
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                          disabled={!canUpdateSlotStatus || effectiveSlotStatus === "BLOCKED"}
                                          onSelect={() =>
                                            void onSlotContextAction?.({
                                              event: { ...event, slotId },
                                              status: "BLOCKED",
                                            })
                                          }
                                        >
                                          Set Blocked
                                        </ContextMenuItem>
                                        <ContextMenuSeparator />
                                        <ContextMenuItem
                                          disabled={!canUpdateSlotStatus}
                                          onSelect={() =>
                                            void onSlotContextAction?.({
                                              event: { ...event, slotId },
                                              status: "REMOVE",
                                            })
                                          }
                                        >
                                          Remove Slot
                                        </ContextMenuItem>
                                      </ContextMenuContent>
                                    </ContextMenu>
                                  );
                                }

                                return (
                                  <div key={event.id}>{eventNode}</div>
                                );
                              })}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </DroppableCell>
              );

              const cell = (
                <div
                  className={cn(
                    "group border-border/70 border-r border-b last:border-r-0",
                    (!isCurrentMonth || isDisabledDay) &&
                      "calendar-disabled-pattern text-muted-foreground/70",
                    isCurrentMonth &&
                      isBlockedDay &&
                      !isDisabledDay &&
                      "calendar-holiday-pattern text-red-900/75 dark:text-red-200/80",
                    isCurrentMonth &&
                      !isDisabledDay &&
                      !isBlockedDay &&
                      !isManagedHoliday &&
                      isBookedDay &&
                      (bookedDayVariant === "solid"
                        ? "bg-emerald-100/62 text-emerald-900/85 dark:bg-emerald-500/18 dark:text-emerald-100/85"
                        : "event-booked-pattern text-emerald-900/85 dark:text-emerald-100/85"),
                    isCurrentMonth &&
                      !isDisabledDay &&
                      !isBlockedDay &&
                      !isManagedHoliday &&
                      !isBookedDay &&
                      isAvailableDay &&
                      "bg-sky-100/60 dark:bg-sky-500/15",
                    isCurrentMonth &&
                      !isDisabledDay &&
                      !isBlockedDay &&
                      !isManagedHoliday &&
                      !isBookedDay &&
                      !isAvailableDay &&
                      isFullDay &&
                      "bg-orange-100/60 dark:bg-orange-500/15",
                  )}
                  data-outside-cell={!isCurrentMonth || undefined}
                  data-disabled-cell={isDisabledDay || undefined}
                  data-today={isToday(day) || undefined}
                  key={day.toString()}
                >
                  {onHolidayContextAction ? (
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div>{cellContent}</div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuLabel>
                          {calendarSystem === "nepali"
                            ? `${formatCalendarWeekday(
                                day,
                                calendarSystem,
                              )} ${formatCalendarDayNumber(day, calendarSystem)}`
                            : format(day, "EEE, MMM d, yyyy")}
                        </ContextMenuLabel>
                        <ContextMenuSeparator />
                        {isManagedHoliday ? (
                          <ContextMenuItem
                            disabled={isDisabledDay}
                            onSelect={() =>
                              void onHolidayContextAction({
                                dateKey,
                                action: "CLEAR_HOLIDAY",
                              })
                            }
                          >
                            Remove Holiday
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem
                            disabled={isDisabledDay}
                            onSelect={() =>
                              void onHolidayContextAction({
                                dateKey,
                                action: "MARK_HOLIDAY",
                              })
                            }
                          >
                            Mark as Holiday
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ) : (
                    cellContent
                  )}
                </div>
              );

              if (onDaySelect && dayStatus === "FULL") {
                return (
                  <Tooltip key={day.toString()}>
                    <TooltipTrigger asChild>
                      {cell}
                    </TooltipTrigger>
                    <TooltipContent>
                      {fullDayTooltip}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return cell;
            })}
          </div>
        ))}
      </div>
    </div>
    </TooltipProvider>
  );
}
