"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { EventCalendarSystemSwitch } from "./event-calendar-system-switch";
import type { CalendarSystem } from "./calendar-system";
import type { CalendarEvent, CalendarView } from "./types";
import {
  clearDoctorHolidayAction,
  deleteDoctorSlotAction,
  markDoctorHolidayAction,
  setDoctorSlotStatusAction,
} from "@/lib/actions/doctor-operations-actions";

type DoctorScheduleCalendarProps = {
  blockedDates: string[];
  holidayDates: string[];
  events: CalendarEvent[];
  className?: string;
  defaultCalendarSystem?: CalendarSystem;
  initialView?: CalendarView;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Action failed.";
}

function buildPastDateKeys() {
  const keys: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 365);

  while (cursor < today) {
    keys.push(format(cursor, "yyyy-MM-dd"));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function DoctorScheduleCalendar({
  blockedDates,
  holidayDates,
  events,
  className,
  defaultCalendarSystem = "nepali",
  initialView = "month",
}: DoctorScheduleCalendarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const disabledPastDates = useMemo(() => buildPastDateKeys(), []);

  const runMutation = (
    callback: () => Promise<void>,
    successMessage: string,
  ) => {
    startTransition(async () => {
      try {
        await callback();
        toast.success(successMessage);
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    });
  };

  return (
    <EventCalendarSystemSwitch
      allowCreate={false}
      blockedDates={blockedDates}
      className={className}
      defaultCalendarSystem={defaultCalendarSystem}
      events={events}
      holidayDates={holidayDates}
      initialView={initialView}
      restrictPastNavigation
      disabledDates={disabledPastDates}
      onHolidayContextAction={({ action, dateKey }) => {
        if (isPending) return;

        const todayKey = format(new Date(), "yyyy-MM-dd");
        if (dateKey < todayKey) {
          toast.error("Past dates cannot be changed.");
          return;
        }

        runMutation(
          () =>
            action === "MARK_HOLIDAY"
              ? markDoctorHolidayAction({ date: dateKey })
              : clearDoctorHolidayAction({ date: dateKey }),
          action === "MARK_HOLIDAY"
            ? "Holiday added."
            : "Holiday removed.",
        );
      }}
      onSlotContextAction={({ event, status }) => {
        if (isPending) return;

        const eventStart = new Date(event.start);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (eventStart < today) {
          toast.error("Past slots cannot be changed.");
          return;
        }

        const slotId = event.slotId ?? event.id;
        if (!slotId) {
          toast.error("Slot id is missing.");
          return;
        }
        if (status === "REMOVE") {
          runMutation(
            () => deleteDoctorSlotAction({ slotId }),
            "Slot removed.",
          );
          return;
        }
        runMutation(
          () => setDoctorSlotStatusAction({ slotId, status }),
          status === "HELD"
            ? "Slot marked as reserved."
            : status === "BLOCKED"
              ? "Slot blocked."
              : "Slot reopened.",
        );
      }}
    />
  );
}
