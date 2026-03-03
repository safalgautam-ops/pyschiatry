"use client";

import { useEffect, useState } from "react";

import type { CalendarSystem } from "@/components/sheduling/calendar-system";

const CALENDAR_SYSTEM_KEY = "precious-physio:calendar-system";
const CALENDAR_SYSTEM_EVENT = "precious-physio:calendar-system-change";

function isCalendarSystem(value: string | null): value is CalendarSystem {
  return value === "gregorian" || value === "nepali";
}

export function useCalendarSystemPreference(
  defaultValue: CalendarSystem = "gregorian",
) {
  const [calendarSystem, setCalendarSystem] = useState<CalendarSystem>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CALENDAR_SYSTEM_KEY);
      if (isCalendarSystem(stored)) {
        setCalendarSystem(stored);
      }
    } catch {
      // ignore localStorage read errors
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      window.localStorage.setItem(CALENDAR_SYSTEM_KEY, calendarSystem);
      window.dispatchEvent(
        new CustomEvent(CALENDAR_SYSTEM_EVENT, { detail: calendarSystem }),
      );
    } catch {
      // ignore localStorage write errors
    }
  }, [calendarSystem, isHydrated]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CALENDAR_SYSTEM_KEY) return;
      if (isCalendarSystem(event.newValue)) {
        setCalendarSystem(event.newValue);
      }
    };

    const onCustom = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (isCalendarSystem(customEvent.detail)) {
        setCalendarSystem(customEvent.detail);
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(CALENDAR_SYSTEM_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CALENDAR_SYSTEM_EVENT, onCustom as EventListener);
    };
  }, []);

  return { calendarSystem, setCalendarSystem };
}
