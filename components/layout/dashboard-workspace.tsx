"use client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { DashboardSummary } from "@/lib/dashboard/service";
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  formatISO,
  startOfDay,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { setDoctorStaffStatusAction } from "@/lib/actions/dashboard-actions";
import {
  bookPatientSlotAction,
  clearDoctorHolidayAction,
  deleteDoctorSlotAction,
  markDoctorHolidayAction,
  setDoctorSlotStatusAction,
} from "@/lib/actions/doctor-operations-actions";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { IconCirclePlusFilled } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { EventCalendar } from "@/components/sheduling";
import {
  formatCalendarDayTitle,
  formatCalendarMonthYear,
  formatCalendarShortMonthYear,
  isCalendarMonthAfter,
  isSameCalendarMonth,
  shiftCalendarMonth,
  type CalendarSystem,
} from "@/components/sheduling/calendar-system";
import type {
  CalendarEvent,
  CalendarSlotOption,
  CalendarView,
} from "@/components/sheduling";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCalendarSystemPreference } from "@/hooks/use-calendar-system-preference";
import { GlowingEffect } from "@/components/ui/glowing-effect";

type DashboardWorkspaceProps = {
  user: AuthenticatedUser;
  summary: DashboardSummary;
};

type BookingDraft = {
  phone: string;
  message: string;
  additionalDetails: string;
};

function slotWindowKey(startsAt: Date | string, endsAt: Date | string) {
  return `${formatISO(new Date(startsAt))}__${formatISO(new Date(endsAt))}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Action failed.";
}

function formatDateTime(value: Date | string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDoctorName(value: string) {
  const trimmed = value.trim();
  if (/^dr\.?\s+/i.test(trimmed)) return trimmed;
  return `Dr. ${trimmed}`;
}

function getEventColor(status: string): CalendarEvent["color"] {
  if (status === "CONFIRMED") return "emerald";
  if (status === "BOOKED") return "emeraldStriped";
  if (status === "COMPLETED") return "violet";
  if (status === "PENDING") return "amber";
  return "orange";
}

function getCalendarTitle(
  currentDate: Date,
  view: CalendarView,
  calendarSystem: CalendarSystem,
) {
  if (view === "month") {
    return formatCalendarMonthYear(currentDate, calendarSystem);
  }

  if (view === "week") {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });
    if (isSameCalendarMonth(start, end, calendarSystem)) {
      return formatCalendarMonthYear(start, calendarSystem);
    }
    return `${formatCalendarShortMonthYear(
      start,
      calendarSystem,
    )} - ${formatCalendarShortMonthYear(end, calendarSystem)}`;
  }

  return formatCalendarDayTitle(currentDate, calendarSystem);
}

function toDateKey(value: Date | string) {
  return format(new Date(value), "yyyy-MM-dd");
}

function buildSaturdayHolidayKeys() {
  const keys: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 14);

  for (let i = 0; i < 420; i += 1) {
    if (cursor.getDay() === 6) {
      keys.push(toDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function buildPastDateKeys() {
  const keys: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 365);

  while (cursor < today) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function SummaryCards({
  role,
  summary,
}: {
  role: AuthenticatedUser["role"];
  summary: DashboardSummary;
}) {
  const upcomingSessionCount = summary.patientAppointments.filter(
    (appointment) => new Date(appointment.startsAt) >= new Date(),
  ).length;

  const items =
    role === "PATIENT"
      ? [
          { label: "Linked Doctors", value: summary.doctorScope.length },
          { label: "Active Appointments", value: summary.counts.appointments },
          { label: "Upcoming Sessions", value: upcomingSessionCount },
          { label: "My Reports", value: summary.counts.documents },
        ]
      : [
          { label: "Patients", value: summary.counts.patients },
          { label: "Staff", value: summary.counts.staff },
          { label: "Appointments", value: summary.counts.appointments },
          { label: "Open Slots", value: summary.counts.openSlots },
          { label: "Documents", value: summary.counts.documents },
          { label: "Recovery Requests", value: summary.counts.pendingRecovery },
        ];

  return (
    <Frame className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <FramePanel
          key={item.label}
          className="space-y-2 p-5 m-0! h-full border-none"
        >
          <p className="font-at-aero-medium text-muted-foreground text-sm">
            {item.label}
          </p>
          <p className="font-cormorant text-4xl leading-none">{item.value}</p>
        </FramePanel>
      ))}
    </Frame>
  );
}

export function DashboardWorkspace({ user, summary }: DashboardWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const canManageAssignments = user.role === "DOCTOR";

  const bookedScheduleEvents = useMemo<CalendarEvent[]>(() => {
    if (user.role === "PATIENT") {
      const activeBookedWindowKeys = new Set(
        summary.patientAppointments
          .filter((appointment) => appointment.status !== "CANCELLED")
          .map((appointment) =>
            slotWindowKey(appointment.startsAt, appointment.endsAt),
          ),
      );

      const booked = summary.patientAppointments.map((appointment) => ({
        id: `appt-${appointment.id}`,
        title: appointment.doctorName,
        description: `Status: ${appointment.status}`,
        start: new Date(appointment.startsAt),
        end: new Date(appointment.endsAt),
        color: getEventColor(appointment.status),
      }));

      const groupedOpenSlots = new Map<string, CalendarSlotOption[]>();
      for (const slot of summary.patientAvailableSlots) {
        const key = slotWindowKey(slot.startsAt, slot.endsAt);
        if (activeBookedWindowKeys.has(key)) continue;
        const list = groupedOpenSlots.get(key) ?? [];
        list.push({
          slotId: slot.id,
          doctorUserId: slot.doctorUserId,
          doctorName: slot.doctorName,
          startsAt: new Date(slot.startsAt),
          endsAt: new Date(slot.endsAt),
        });
        groupedOpenSlots.set(key, list);
      }

      const open = [...groupedOpenSlots.values()].map((options) => {
        const [first] = options;
        const doctorCount = options.length;
        return {
          id: `open-${options.map((item) => item.slotId).join("-")}`,
          slotId: doctorCount === 1 ? first.slotId : undefined,
          slotOptions: options,
          slotStatus: "OPEN" as const,
          title:
            doctorCount > 1
              ? `Open Slot (${doctorCount} doctors)`
              : "Open Slot",
          description:
            doctorCount > 1
              ? `${doctorCount} doctors available for this time.`
              : `Available with ${first.doctorName}.`,
          start: first.startsAt,
          end: first.endsAt,
          color: "sky" as const,
        };
      });

      return [...booked, ...open];
    }

    const booked = summary.tenantAppointments.map((appointment) => ({
      id: `appt-${appointment.id}`,
      title: "Booked Session",
      description:
        user.role === "DOCTOR"
          ? `${appointment.patientName} - ${appointment.status}`
          : `${formatDoctorName(appointment.doctorName)} - ${appointment.status}`,
      start: new Date(appointment.startsAt),
      end: new Date(appointment.endsAt),
      color: getEventColor(appointment.status),
    }));

    const open = summary.tenantOpenSlots.map((slot) => ({
      id: `open-${slot.id}`,
      slotId: slot.id,
      slotStatus: "OPEN" as const,
      title:
        user.role === "DOCTOR"
          ? "Open Slot"
          : `${formatDoctorName(slot.doctorName)} Open Slot`,
      description: "Available for patient booking",
      start: new Date(slot.startsAt),
      end: new Date(slot.endsAt),
      color: "sky" as const,
    }));

    return [...booked, ...open];
  }, [
    summary.patientAppointments,
    summary.patientAvailableSlots,
    summary.tenantAppointments,
    summary.tenantOpenSlots,
    user.role,
  ]);

  const blockedDates = useMemo(
    () =>
      Array.from(
        new Set([...buildSaturdayHolidayKeys(), ...summary.holidayDates]),
      ),
    [summary.holidayDates],
  );
  const disabledPastDates = useMemo(() => buildPastDateKeys(), []);

  const runAction = (
    fn: () => Promise<{ success: boolean; message?: string }>,
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        toast.error(result.message ?? "Action failed.");
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  };

  const bookPatientSlot = (slotId: string, bookingMessage?: string) => {
    if (user.role !== "PATIENT") return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("slotId", slotId);
      if (bookingMessage?.trim()) {
        formData.set("bookingMessage", bookingMessage.trim());
      }
      try {
        await bookPatientSlotAction(formData);
        toast.success("Appointment booked.");
        setIsBookingDialogOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    });
  };

  const runDoctorCalendarMutation = (
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

  const canManageDoctorCalendar = user.role === "DOCTOR";

  const bookedScheduleSubtitle =
    user.role === "PATIENT"
      ? "Quick view of your booked sessions with doctors."
      : "Quick view of booked sessions across your tenant.";

  const bookedScheduleTitle =
    user.role === "PATIENT" ? "My Booked Schedule" : "Booked Schedule";
  const [bookedCalendarDate, setBookedCalendarDate] = useState(new Date());
  const [bookedCalendarView, setBookedCalendarView] = useState<
    "month" | "week" | "day"
  >("month");
  const { calendarSystem, setCalendarSystem } =
    useCalendarSystemPreference("gregorian");

  const bookedCalendarTitle = useMemo(
    () =>
      getCalendarTitle(bookedCalendarDate, bookedCalendarView, calendarSystem),
    [bookedCalendarDate, bookedCalendarView, calendarSystem],
  );

  const handleBookedCalendarPrevious = () => {
    if (user.role === "PATIENT" || user.role === "DOCTOR") {
      const today = new Date();
      if (
        bookedCalendarView === "month" &&
        !isCalendarMonthAfter(bookedCalendarDate, today, calendarSystem)
      ) {
        return;
      }
      if (
        bookedCalendarView === "week" &&
        startOfWeek(bookedCalendarDate, { weekStartsOn: 0 }) <=
          startOfWeek(today, { weekStartsOn: 0 })
      ) {
        return;
      }
      if (
        bookedCalendarView === "day" &&
        startOfDay(bookedCalendarDate) <= startOfDay(today)
      ) {
        return;
      }
    }

    if (bookedCalendarView === "month") {
      setBookedCalendarDate((prev) =>
        shiftCalendarMonth(prev, -1, calendarSystem),
      );
      return;
    }
    if (bookedCalendarView === "week") {
      setBookedCalendarDate((prev) => subWeeks(prev, 1));
      return;
    }
    setBookedCalendarDate((prev) => addDays(prev, -1));
  };

  const handleBookedCalendarNext = () => {
    if (bookedCalendarView === "month") {
      setBookedCalendarDate((prev) =>
        shiftCalendarMonth(prev, 1, calendarSystem),
      );
      return;
    }
    if (bookedCalendarView === "week") {
      setBookedCalendarDate((prev) => addWeeks(prev, 1));
      return;
    }
    setBookedCalendarDate((prev) => addDays(prev, 1));
  };

  const canGoPrevious = useMemo(() => {
    if (user.role !== "PATIENT" && user.role !== "DOCTOR") return true;
    const today = new Date();

    if (bookedCalendarView === "month") {
      return isCalendarMonthAfter(bookedCalendarDate, today, calendarSystem);
    }
    if (bookedCalendarView === "week") {
      return (
        startOfWeek(bookedCalendarDate, { weekStartsOn: 0 }) >
        startOfWeek(today, { weekStartsOn: 0 })
      );
    }
    return startOfDay(bookedCalendarDate) > startOfDay(today);
  }, [bookedCalendarDate, bookedCalendarView, calendarSystem, user.role]);

  const patientAvailableDateKeys = useMemo(
    () =>
      Array.from(
        new Set(
          summary.patientAvailableSlots.map((slot) => toDateKey(slot.startsAt)),
        ),
      ),
    [summary.patientAvailableSlots],
  );

  const patientBookedDateKeys = useMemo(
    () =>
      Array.from(
        new Set(
          summary.patientAppointments
            .filter((appointment) => appointment.status !== "CANCELLED")
            .map((appointment) => toDateKey(appointment.startsAt)),
        ),
      ),
    [summary.patientAppointments],
  );

  const doctorBookedDateKeys = useMemo(() => {
    if (user.role === "PATIENT") return [];

    const openDateKeys = new Set(
      summary.tenantOpenSlots.map((slot) => toDateKey(slot.startsAt)),
    );
    const bookedDateKeys = new Set(
      summary.tenantAppointments
        .filter((appointment) => appointment.status !== "CANCELLED")
        .map((appointment) => toDateKey(appointment.startsAt)),
    );

    return Array.from(bookedDateKeys).filter((key) => !openDateKeys.has(key));
  }, [summary.tenantAppointments, summary.tenantOpenSlots, user.role]);

  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [selectedBookingOptions, setSelectedBookingOptions] = useState<
    CalendarSlotOption[]
  >([]);
  const [selectedBookingSlotId, setSelectedBookingSlotId] = useState("");
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>({
    phone: summary.currentUserContact.phone ?? "",
    message: "",
    additionalDetails: "",
  });

  const selectedBookingOption = useMemo(
    () =>
      selectedBookingOptions.find(
        (option) => option.slotId === selectedBookingSlotId,
      ) ??
      selectedBookingOptions[0] ??
      null,
    [selectedBookingOptions, selectedBookingSlotId],
  );

  const openPatientBookingDialog = (event: CalendarEvent) => {
    if (event.slotStatus !== "OPEN") return;
    const options =
      event.slotOptions && event.slotOptions.length > 0
        ? event.slotOptions
        : event.slotId
          ? [
              {
                slotId: event.slotId,
                doctorUserId: "",
                doctorName: event.title.replace(/\s+Open Slot$/i, ""),
                startsAt: new Date(event.start),
                endsAt: new Date(event.end),
              },
            ]
          : [];

    if (options.length === 0) {
      toast.error("No slot option is available for booking.");
      return;
    }

    setSelectedBookingOptions(options);
    setSelectedBookingSlotId(options[0].slotId);
    setBookingDraft({
      phone: summary.currentUserContact.phone ?? "",
      message: "",
      additionalDetails: "",
    });
    setIsBookingDialogOpen(true);
  };

  if (user.role === "PATIENT") {
    return (
      <div className="@container/main font-at-aero-regular flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Frame className="w-full">
          <FramePanel className="overflow-hidden p-0">
            <div className="border-b px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="font-cormorant text-2xl leading-none">
                    {bookedScheduleTitle}
                  </h2>
                  <p className="font-at-aero-regular text-muted-foreground text-sm">
                    {bookedScheduleSubtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    aria-label="Previous period"
                    disabled={!canGoPrevious}
                    onClick={handleBookedCalendarPrevious}
                    size="icon"
                    variant="ghost"
                  >
                    <ChevronLeftIcon aria-hidden="true" size={16} />
                  </Button>
                  <Button
                    aria-label="Next period"
                    onClick={handleBookedCalendarNext}
                    size="icon"
                    variant="ghost"
                  >
                    <ChevronRightIcon aria-hidden="true" size={16} />
                  </Button>
                  <span className="font-cormorant min-w-[170px] text-xl leading-none sm:text-2xl">
                    {bookedCalendarTitle}
                  </span>
                  <Button
                    onClick={() => {
                      setBookedCalendarDate(new Date());
                      setBookedCalendarView("month");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Today
                  </Button>
                  <ToggleGroup
                    onValueChange={(value) => {
                      if (value === "gregorian" || value === "nepali") {
                        setCalendarSystem(value);
                      }
                    }}
                    size="sm"
                    type="single"
                    value={calendarSystem}
                    variant="outline"
                  >
                    <ToggleGroupItem value="gregorian">AD</ToggleGroupItem>
                    <ToggleGroupItem value="nepali">BS</ToggleGroupItem>
                  </ToggleGroup>
                  {bookedCalendarView === "day" && (
                    <Button
                      onClick={() => setBookedCalendarView("month")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Month
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <EventCalendar
              allowCreate={false}
              blockedDates={blockedDates}
              calendarSystem={calendarSystem}
              className="px-4 py-4"
              currentDate={bookedCalendarDate}
              disabledDates={disabledPastDates}
              monthAvailableDates={patientAvailableDateKeys}
              monthBookedDates={patientBookedDateKeys}
              monthBookedDayVariant="solid"
              monthBookedDayLabel="Booked"
              monthHideEvents={bookedCalendarView === "month"}
              onCurrentDateChange={setBookedCalendarDate}
              onEventSelectReadOnly={(event) => {
                openPatientBookingDialog(event);
              }}
              onMonthDaySelect={({ date, status }) => {
                if (
                  status === "OUTSIDE" ||
                  status === "DISABLED" ||
                  status === "BLOCKED" ||
                  status === "HOLIDAY"
                ) {
                  return;
                }
                setBookedCalendarDate(date);
                setBookedCalendarView("day");
              }}
              onSlotBookAction={({ event }) => {
                openPatientBookingDialog(event);
              }}
              onViewChange={(nextView) => {
                if (nextView === "month" || nextView === "day") {
                  setBookedCalendarView(nextView);
                }
              }}
              events={bookedScheduleEvents}
              showToolbar={false}
              view={bookedCalendarView}
            />
          </FramePanel>
        </Frame>

        <Dialog
          onOpenChange={(open) => {
            setIsBookingDialogOpen(open);
            if (!open) {
              setSelectedBookingOptions([]);
              setSelectedBookingSlotId("");
            }
          }}
          open={isBookingDialogOpen}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Book Appointment</DialogTitle>
              <DialogDescription>
                Confirm account details and share anything important before
                booking.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              {selectedBookingOption && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-at-aero-medium text-foreground">
                    {formatDateTime(selectedBookingOption.startsAt)} -{" "}
                    {formatDateTime(selectedBookingOption.endsAt)}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {selectedBookingOptions.length > 1
                      ? `${selectedBookingOptions.length} doctors are available at this time.`
                      : `Doctor: ${selectedBookingOption.doctorName}`}
                  </p>
                </div>
              )}

              {selectedBookingOptions.length > 1 && (
                <div className="grid gap-2">
                  <Label htmlFor="bookingDoctor">Select Doctor</Label>
                  <Select
                    onValueChange={setSelectedBookingSlotId}
                    value={selectedBookingSlotId}
                  >
                    <SelectTrigger id="bookingDoctor">
                      <SelectValue placeholder="Choose doctor" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedBookingOptions.map((option) => (
                        <SelectItem key={option.slotId} value={option.slotId}>
                          {option.doctorName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bookingName">Name</Label>
                  <Input
                    id="bookingName"
                    readOnly
                    value={summary.currentUserContact.name}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bookingEmail">Email</Label>
                  <Input
                    id="bookingEmail"
                    readOnly
                    value={summary.currentUserContact.email}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bookingPhone">Phone</Label>
                <Input
                  id="bookingPhone"
                  onChange={(event) =>
                    setBookingDraft((prev) => ({
                      ...prev,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="Enter your phone number"
                  value={bookingDraft.phone}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bookingMessage">Message to Doctor</Label>
                <Textarea
                  id="bookingMessage"
                  onChange={(event) =>
                    setBookingDraft((prev) => ({
                      ...prev,
                      message: event.target.value,
                    }))
                  }
                  placeholder="Any symptoms or context for this session"
                  value={bookingDraft.message}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bookingDetails">Other Details</Label>
                <Textarea
                  id="bookingDetails"
                  onChange={(event) =>
                    setBookingDraft((prev) => ({
                      ...prev,
                      additionalDetails: event.target.value,
                    }))
                  }
                  placeholder="Add any additional details before appointment"
                  value={bookingDraft.additionalDetails}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => setIsBookingDialogOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedBookingOption || isPending}
                onClick={() => {
                  if (!selectedBookingOption) return;
                  const bookingMessage = [
                    `New booking request`,
                    `Name: ${summary.currentUserContact.name}`,
                    `Email: ${summary.currentUserContact.email}`,
                    bookingDraft.phone.trim()
                      ? `Phone: ${bookingDraft.phone.trim()}`
                      : null,
                    `Doctor: ${selectedBookingOption.doctorName}`,
                    `Time: ${formatDateTime(selectedBookingOption.startsAt)} - ${formatDateTime(selectedBookingOption.endsAt)}`,
                    bookingDraft.message.trim()
                      ? `Message: ${bookingDraft.message.trim()}`
                      : null,
                    bookingDraft.additionalDetails.trim()
                      ? `Other details: ${bookingDraft.additionalDetails.trim()}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join("\n");

                  bookPatientSlot(selectedBookingOption.slotId, bookingMessage);
                }}
                type="button"
              >
                Confirm Booking
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="@container/main font-at-aero-regular flex flex-1 flex-col gap-4 p-4 md:p-6">
      <SummaryCards role={user.role} summary={summary} />
      <div>
        <h2 className="font-cormorant text-2xl leading-none">
          {bookedScheduleTitle}
        </h2>
        <p className="font-at-aero-regular text-muted-foreground mt-1 text-sm">
          {bookedScheduleSubtitle}
        </p>
      </div>
      <Frame className="w-full">
        <FramePanel className="overflow-hidden p-0">
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  aria-label="Previous period"
                  disabled={!canGoPrevious}
                  onClick={handleBookedCalendarPrevious}
                  size="icon"
                  variant="ghost"
                >
                  <ChevronLeftIcon aria-hidden="true" size={16} />
                </Button>
                <Button
                  aria-label="Next period"
                  onClick={handleBookedCalendarNext}
                  size="icon"
                  variant="ghost"
                >
                  <ChevronRightIcon aria-hidden="true" size={16} />
                </Button>
                <span className="font-cormorant min-w-[170px] text-xl leading-none sm:text-2xl">
                  {bookedCalendarTitle}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setBookedCalendarDate(new Date())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Today
                </Button>
                <ToggleGroup
                  onValueChange={(value) => {
                    if (value === "gregorian" || value === "nepali") {
                      setCalendarSystem(value);
                    }
                  }}
                  size="sm"
                  type="single"
                  value={calendarSystem}
                  variant="outline"
                >
                  <ToggleGroupItem value="gregorian">AD</ToggleGroupItem>
                  <ToggleGroupItem value="nepali">BS</ToggleGroupItem>
                </ToggleGroup>
                <Select
                  onValueChange={(value: "month" | "week" | "day") =>
                    setBookedCalendarView(value)
                  }
                  value={bookedCalendarView}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="View" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <EventCalendar
            blockedDates={blockedDates}
            calendarSystem={calendarSystem}
            // className="px-4 py-4"
            allowCreate={false}
            currentDate={bookedCalendarDate}
            disabledDates={
              user.role === "DOCTOR" ? disabledPastDates : undefined
            }
            holidayDates={summary.holidayDates}
            monthBookedDates={doctorBookedDateKeys}
            events={bookedScheduleEvents}
            onCurrentDateChange={setBookedCalendarDate}
            onMonthDaySelect={({ date, status }) => {
              if (status === "OUTSIDE" || status === "DISABLED") return;
              setBookedCalendarDate(date);
              setBookedCalendarView("day");
            }}
            onHolidayContextAction={
              canManageDoctorCalendar
                ? ({ action, dateKey }) => {
                    if (dateKey < toDateKey(new Date())) {
                      toast.error("Past dates cannot be changed.");
                      return;
                    }
                    if (action === "MARK_HOLIDAY") {
                      runDoctorCalendarMutation(
                        () => markDoctorHolidayAction({ date: dateKey }),
                        "Holiday added.",
                      );
                      return;
                    }
                    runDoctorCalendarMutation(
                      () => clearDoctorHolidayAction({ date: dateKey }),
                      "Holiday removed.",
                    );
                  }
                : undefined
            }
            onSlotContextAction={
              canManageDoctorCalendar
                ? ({ event, status }) => {
                    if (new Date(event.start) < startOfDay(new Date())) {
                      toast.error("Past slots cannot be changed.");
                      return;
                    }
                    const slotId = event.slotId ?? event.id;
                    if (!slotId) return;
                    if (status === "REMOVE") {
                      runDoctorCalendarMutation(
                        () => deleteDoctorSlotAction({ slotId }),
                        "Slot removed.",
                      );
                      return;
                    }
                    runDoctorCalendarMutation(
                      () => setDoctorSlotStatusAction({ slotId, status }),
                      status === "HELD"
                        ? "Slot marked as reserved."
                        : status === "BLOCKED"
                          ? "Slot blocked."
                          : "Slot reopened.",
                    );
                  }
                : undefined
            }
            onViewChange={(nextView) => {
              if (
                nextView === "month" ||
                nextView === "week" ||
                nextView === "day"
              ) {
                setBookedCalendarView(nextView);
              }
            }}
            showToolbar={false}
            view={bookedCalendarView}
          />
        </FramePanel>
      </Frame>
      <Tabs defaultValue="staff" className="w-full gap-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
          </TabsList>

          {canManageAssignments && (
            <Button asChild size="sm" className="hidden h-7 sm:flex">
              <Link href="/dashboard/doctor/staff">
                <IconCirclePlusFilled />
                <span>Add staff</span>
              </Link>
            </Button>
          )}
        </div>

        <TabsContent value="staff">
          <section className="space-y-2">
            <h2 className="font-cormorant text-2xl leading-none">
              Doctor-Staff Assignments
            </h2>
            <p className="font-at-aero-regular text-muted-foreground text-sm">
              Tenant staff assignment and activation state (`doctor_staff`).
            </p>
            <Frame className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.tenantStaff.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        No doctor-staff assignments found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.tenantStaff.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.doctorName}</TableCell>
                        <TableCell>{item.staffName}</TableCell>
                        <TableCell>{item.staffEmail}</TableCell>
                        <TableCell>
                          {canManageAssignments ? (
                            <Select
                              defaultValue={item.staffRole}
                              onValueChange={(value: "ADMIN" | "RECEPTION") =>
                                runAction(() =>
                                  setDoctorStaffStatusAction({
                                    doctorStaffId: item.id,
                                    staffRole: value,
                                  }),
                                )
                              }
                            >
                              <SelectTrigger className="w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ADMIN">ADMIN</SelectItem>
                                <SelectItem value="RECEPTION">
                                  RECEPTION
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">{item.staffRole}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {canManageAssignments ? (
                            <Button
                              onClick={() =>
                                runAction(() =>
                                  setDoctorStaffStatusAction({
                                    doctorStaffId: item.id,
                                    isActive: !item.isActive,
                                  }),
                                )
                              }
                              size="sm"
                              variant={item.isActive ? "outline" : "default"}
                            >
                              {item.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          ) : (
                            <Badge
                              variant={item.isActive ? "secondary" : "outline"}
                            >
                              {item.isActive ? "ACTIVE" : "INACTIVE"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Frame>
          </section>
        </TabsContent>

        <TabsContent value="appointments">
          <section className="space-y-2">
            <h2 className="font-cormorant text-2xl leading-none">
              Tenant Appointments
            </h2>
            <p className="font-at-aero-regular text-muted-foreground text-sm">
              Appointment records scoped by `doctor_user_id`.
            </p>
            <Frame className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead>Ends</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.tenantAppointments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        No appointments found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.tenantAppointments.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.doctorName}</TableCell>
                        <TableCell>{item.patientName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(item.startsAt)}</TableCell>
                        <TableCell>{formatDateTime(item.endsAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Frame>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
