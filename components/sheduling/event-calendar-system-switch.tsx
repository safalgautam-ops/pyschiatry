"use client";

import type { CalendarSystem } from "./calendar-system";
import { EventCalendar, type EventCalendarProps } from "./event-calendar";
import { useCalendarSystemPreference } from "@/hooks/use-calendar-system-preference";

type EventCalendarSystemSwitchProps = Omit<EventCalendarProps, "calendarSystem"> & {
  defaultCalendarSystem?: CalendarSystem;
};

export function EventCalendarSystemSwitch({
  defaultCalendarSystem = "gregorian",
  ...props
}: EventCalendarSystemSwitchProps) {
  const { calendarSystem, setCalendarSystem } =
    useCalendarSystemPreference(defaultCalendarSystem);

  return (
    <EventCalendar
      {...props}
      calendarSystem={calendarSystem}
      onCalendarSystemChange={setCalendarSystem}
      showCalendarSystemToggle
    />
  );
}
