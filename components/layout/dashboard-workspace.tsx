"use client";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { DashboardSummary } from "@/lib/dashboard/service";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isSameMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  assignStaffToDoctorAction,
  linkPatientToDoctorAction,
  setDoctorPatientStatusAction,
  setDoctorStaffStatusAction,
} from "@/lib/actions/dashboard-actions";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { EventCalendar } from "@/components/sheduling";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function formatDateTime(value: Date | string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getEventColor(status: string): CalendarEvent["color"] {
  if (status === "CONFIRMED") return "emerald";
  if (status === "BOOKED") return "sky";
  if (status === "COMPLETED") return "violet";
  if (status === "PENDING") return "amber";
  return "orange";
}

function getCalendarTitle(currentDate: Date, view: CalendarView) {
  if (view === "month") {
    return format(currentDate, "MMMM yyyy");
  }

  if (view === "week") {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });
    if (isSameMonth(start, end)) {
      return format(start, "MMMM yyyy");
    }
    return `${format(start, "MMM")} - ${format(end, "MMM yyyy")}`;
  }

  return format(currentDate, "EEE MMMM d, yyyy");
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
      return summary.patientAppointments.map((appointment) => ({
        id: appointment.id,
        title: appointment.doctorName,
        description: `Status: ${appointment.status}`,
        start: new Date(appointment.startsAt),
        end: new Date(appointment.endsAt),
        color: getEventColor(appointment.status),
      }));
    }

    return summary.tenantAppointments.map((appointment) => ({
      id: appointment.id,
      title: appointment.patientName,
      description: `Dr. ${appointment.doctorName} - ${appointment.status}`,
      start: new Date(appointment.startsAt),
      end: new Date(appointment.endsAt),
      color: getEventColor(appointment.status),
    }));
  }, [
    summary.patientAppointments,
    summary.tenantAppointments,
    user.role,
  ]);

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

  const bookedCalendarTitle = useMemo(
    () => getCalendarTitle(bookedCalendarDate, bookedCalendarView),
    [bookedCalendarDate, bookedCalendarView],
  );

  const handleBookedCalendarPrevious = () => {
    if (bookedCalendarView === "month") {
      setBookedCalendarDate((prev) => subMonths(prev, 1));
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
      setBookedCalendarDate((prev) => addMonths(prev, 1));
      return;
    }
    if (bookedCalendarView === "week") {
      setBookedCalendarDate((prev) => addWeeks(prev, 1));
      return;
    }
    setBookedCalendarDate((prev) => addDays(prev, 1));
  };

  if (user.role === "PATIENT") {
    return (
      <div className="@container/main font-at-aero-regular flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Frame className="w-full">
          <FramePanel className="overflow-hidden p-0">
            <div className="border-b px-5 py-4 md:flex md:items-start md:justify-between">
              <div>
                <h2 className="font-cormorant text-2xl leading-none">
                  {bookedScheduleTitle}
                </h2>
                <p className="font-at-aero-regular text-muted-foreground mt-1 text-sm">
                  {bookedScheduleSubtitle}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2 md:mt-0">
                <Button
                  aria-label="Previous period"
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
            <EventCalendar
              className="px-4 py-4"
              currentDate={bookedCalendarDate}
              externalCreateEventName="dashboard:quick-create"
              externalCreateEventTarget="patient-booked-schedule"
              onCurrentDateChange={setBookedCalendarDate}
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
      </div>
    );
  }

  return (
    <div className="@container/main font-at-aero-regular flex flex-1 flex-col gap-4 p-4 md:p-6">
      <SummaryCards role={user.role} summary={summary} />
      <Frame className="w-full">
        <FramePanel className="overflow-hidden p-0">
          <div className="border-b px-5 py-4 md:flex md:items-start md:justify-between">
            <div>
              <h2 className="font-cormorant text-2xl leading-none">
                {bookedScheduleTitle}
              </h2>
              <p className="font-at-aero-regular text-muted-foreground mt-1 text-sm">
                {bookedScheduleSubtitle}
              </p>
            </div>

            <div className="mt-3 flex items-center gap-2 md:mt-0">
              <Button
                aria-label="Previous period"
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
          <EventCalendar
            className="px-4 py-4"
            allowCreate={false}
            currentDate={bookedCalendarDate}
            events={bookedScheduleEvents}
            onCurrentDateChange={setBookedCalendarDate}
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
