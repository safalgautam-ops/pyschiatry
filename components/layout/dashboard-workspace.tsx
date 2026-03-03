"use client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { DashboardSummary } from "@/lib/dashboard/service";
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
  assignStaffToDoctorAction,
  linkPatientToDoctorAction,
  setDoctorPatientStatusAction,
  setDoctorStaffStatusAction,
} from "@/lib/actions/dashboard-actions";
import {
  bookPatientSlotAction,
  clearDoctorHolidayAction,
  deleteDoctorSlotAction,
  markDoctorHolidayAction,
  setDoctorSlotStatusAction,
} from "@/lib/actions/doctor-operations-actions";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
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
import type { CalendarEvent, CalendarView } from "@/components/sheduling";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FramePanel } from "@/components/ui/frame";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCalendarSystemPreference } from "@/hooks/use-calendar-system-preference";

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type DashboardWorkspaceProps = {
  user: AuthenticatedUser;
  summary: DashboardSummary;
  doctorOptions: UserOption[];
  patientOptions: UserOption[];
  staffOptions: UserOption[];
};

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
  if (status === "BOOKED") return "sky";
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
        <FramePanel key={item.label} className="space-y-2 p-5">
          <p className="font-at-aero-medium text-muted-foreground text-sm">
            {item.label}
          </p>
          <p className="font-cormorant text-4xl leading-none">{item.value}</p>
        </FramePanel>
      ))}
    </Frame>
  );
}

export function DashboardWorkspace({
  user,
  summary,
  doctorOptions,
  patientOptions,
  staffOptions,
}: DashboardWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const canManageAssignments =
    user.role === "DOCTOR" || (user.role === "STAFF" && summary.isStaffAdmin);

  const defaultDoctorId = useMemo(() => {
    if (user.role === "DOCTOR") return user.id;
    return summary.doctorScope[0] ?? "";
  }, [summary.doctorScope, user.id, user.role]);

  const [linkDoctorId, setLinkDoctorId] = useState(defaultDoctorId);
  const [linkPatientId, setLinkPatientId] = useState("");

  const [assignDoctorId, setAssignDoctorId] = useState(defaultDoctorId);
  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignStaffRole, setAssignStaffRole] = useState<"ADMIN" | "RECEPTION">(
    "RECEPTION",
  );

  const manageDoctors = useMemo(() => {
    if (user.role === "DOCTOR") {
      return doctorOptions.filter((doctor) => doctor.id === user.id);
    }
    if (summary.doctorScope.length === 0) return [];
    const scopedIds = new Set(summary.doctorScope);
    return doctorOptions.filter((doctor) => scopedIds.has(doctor.id));
  }, [doctorOptions, summary.doctorScope, user.id, user.role]);

  const bookedScheduleEvents = useMemo<CalendarEvent[]>(() => {
    if (user.role === "PATIENT") {
      const booked = summary.patientAppointments.map((appointment) => ({
        id: `appt-${appointment.id}`,
        title: appointment.doctorName,
        description: `Status: ${appointment.status}`,
        start: new Date(appointment.startsAt),
        end: new Date(appointment.endsAt),
        color: getEventColor(appointment.status),
      }));

      const open = summary.patientAvailableSlots.map((slot) => ({
        id: `open-${slot.id}`,
        slotId: slot.id,
        slotStatus: "OPEN" as const,
        title: `${slot.doctorName} Open Slot`,
        description: "Available for booking",
        start: new Date(slot.startsAt),
        end: new Date(slot.endsAt),
        color: "sky" as const,
      }));

      return [...booked, ...open];
    }

    const booked = summary.tenantAppointments.map((appointment) => ({
      id: `appt-${appointment.id}`,
      title: appointment.patientName,
      description:
        user.role === "DOCTOR"
          ? `Status: ${appointment.status}`
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

  const bookPatientSlot = (slotId: string) => {
    if (user.role !== "PATIENT") return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("slotId", slotId);
      try {
        await bookPatientSlotAction(formData);
        toast.success("Appointment booked.");
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
      getCalendarTitle(
        bookedCalendarDate,
        bookedCalendarView,
        calendarSystem,
      ),
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

  if (user.role === "PATIENT") {
    return (
      <div className="@container/main font-at-aero-regular flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Frame className="w-full">
          <FramePanel className="overflow-hidden p-0">
            <div className="border-b px-5 py-4">
              <div>
                <h2 className="font-cormorant text-2xl leading-none">
                  {bookedScheduleTitle}
                </h2>
                <p className="font-at-aero-regular text-muted-foreground mt-1 text-sm">
                  {bookedScheduleSubtitle}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
              allowCreate={false}
              blockedDates={blockedDates}
              calendarSystem={calendarSystem}
              className="px-4 py-4"
              currentDate={bookedCalendarDate}
              disabledDates={disabledPastDates}
              onCurrentDateChange={setBookedCalendarDate}
              onEventSelectReadOnly={(event) => {
                if (event.slotStatus !== "OPEN" || !event.slotId) return;
                const confirmed = window.confirm(
                  `Book this slot with ${event.title}?`,
                );
                if (!confirmed) return;
                bookPatientSlot(event.slotId);
              }}
              onSlotBookAction={({ event }) => {
                if (event.slotStatus !== "OPEN" || !event.slotId) return;
                const confirmed = window.confirm(
                  `Book this slot with ${event.title}?`,
                );
                if (!confirmed) return;
                bookPatientSlot(event.slotId);
              }}
              onViewChange={(nextView) => {
                if (nextView === "month" || nextView === "week" || nextView === "day") {
                  setBookedCalendarView(nextView);
                }
              }}
              events={bookedScheduleEvents}
              showToolbar={false}
              view={bookedCalendarView}
            />
          </FramePanel>
        </Frame>

        <Frame className="w-full">
          <FramePanel className="p-0">
            <div className="border-b px-5 py-4">
              <h3 className="font-cormorant text-xl leading-none">
                Available Slots
              </h3>
              <p className="font-at-aero-regular text-muted-foreground mt-1 text-sm">
                Quick booking from open doctor slots.
              </p>
            </div>
            <div className="p-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-right">Book</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.patientAvailableSlots.slice(0, 20).map((slot) => (
                    <TableRow key={slot.id}>
                      <TableCell>{slot.doctorName}</TableCell>
                      <TableCell>{formatDateTime(slot.startsAt)}</TableCell>
                      <TableCell>{formatDateTime(slot.endsAt)}</TableCell>
                      <TableCell className="text-right">
                        <form action={bookPatientSlotAction}>
                          <input type="hidden" name="slotId" value={slot.id} />
                          <Button size="sm" type="submit">
                            Book
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                  {summary.patientAvailableSlots.length === 0 && (
                    <TableRow>
                      <TableCell
                        className="text-center text-muted-foreground"
                        colSpan={4}
                      >
                        No open slots available right now.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </FramePanel>
        </Frame>
      </div>
    );
  }

  return (
    <div className="@container/main font-at-aero-regular flex flex-1 flex-col gap-4 p-4 md:p-6">
      <SummaryCards role={user.role} summary={summary} />
      <Frame className="w-full">
          <FramePanel className="overflow-hidden p-0">
            <div className="border-b px-5 py-4">
              <div>
                <h2 className="font-cormorant text-2xl leading-none">
                  {bookedScheduleTitle}
                </h2>
                <p className="font-at-aero-regular text-muted-foreground mt-1 text-sm">
                  {bookedScheduleSubtitle}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
            className="px-4 py-4"
            allowCreate={false}
            currentDate={bookedCalendarDate}
            disabledDates={user.role === "DOCTOR" ? disabledPastDates : undefined}
            holidayDates={summary.holidayDates}
            events={bookedScheduleEvents}
            onCurrentDateChange={setBookedCalendarDate}
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
              if (nextView === "month" || nextView === "week" || nextView === "day") {
                setBookedCalendarView(nextView);
              }
            }}
            showToolbar={false}
            view={bookedCalendarView}
          />
        </FramePanel>
      </Frame>

      <Tabs defaultValue="patients" className="w-full gap-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
          </TabsList>

          {canManageAssignments && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    Link Patient
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="space-y-3">
                  <div className="font-at-aero-medium text-sm">
                    Create doctor-patient link
                  </div>
                  <div className="space-y-2">
                    <Select
                      onValueChange={setLinkDoctorId}
                      value={linkDoctorId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {manageDoctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      onValueChange={setLinkPatientId}
                      value={linkPatientId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {patientOptions.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id}>
                            {patient.name} ({patient.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      className="w-full"
                      disabled={!linkDoctorId || !linkPatientId || isPending}
                      onClick={() =>
                        runAction(() =>
                          linkPatientToDoctorAction({
                            doctorUserId: linkDoctorId,
                            patientUserId: linkPatientId,
                          }),
                        )
                      }
                      size="sm"
                    >
                      Save Link
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm">Assign Staff</Button>
                </PopoverTrigger>
                <PopoverContent className="space-y-3">
                  <div className="font-at-aero-medium text-sm">
                    Create doctor-staff assignment
                  </div>
                  <div className="space-y-2">
                    <Select
                      onValueChange={setAssignDoctorId}
                      value={assignDoctorId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {manageDoctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      onValueChange={setAssignStaffId}
                      value={assignStaffId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select staff" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffOptions.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.name} ({staff.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      onValueChange={(value: "ADMIN" | "RECEPTION") =>
                        setAssignStaffRole(value)
                      }
                      value={assignStaffRole}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select tenant role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                        <SelectItem value="RECEPTION">RECEPTION</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      className="w-full"
                      disabled={!assignDoctorId || !assignStaffId || isPending}
                      onClick={() =>
                        runAction(() =>
                          assignStaffToDoctorAction({
                            doctorUserId: assignDoctorId,
                            staffUserId: assignStaffId,
                            staffRole: assignStaffRole,
                          }),
                        )
                      }
                      size="sm"
                    >
                      Save Assignment
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <TabsContent value="patients">
          <section className="space-y-2">
            <h2 className="font-cormorant text-2xl leading-none">
              Doctor-Patient Links
            </h2>
            <p className="font-at-aero-regular text-muted-foreground text-sm">
              Strictly scoped by doctor tenant (`doctor_patients`).
            </p>
            <Frame className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.tenantPatients.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        No doctor-patient links found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.tenantPatients.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.doctorName}</TableCell>
                        <TableCell>{item.patientName}</TableCell>
                        <TableCell>{item.patientEmail}</TableCell>
                        <TableCell>
                          {canManageAssignments ? (
                            <Select
                              defaultValue={item.status}
                              onValueChange={(
                                value: "ACTIVE" | "BLOCKED" | "ARCHIVED",
                              ) =>
                                runAction(() =>
                                  setDoctorPatientStatusAction({
                                    doctorPatientId: item.id,
                                    status: value,
                                  }),
                                )
                              }
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                                <SelectItem value="BLOCKED">BLOCKED</SelectItem>
                                <SelectItem value="ARCHIVED">
                                  ARCHIVED
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">{item.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Frame>
          </section>
        </TabsContent>

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
