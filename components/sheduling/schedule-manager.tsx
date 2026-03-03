import {
  applyNepalWeeklyScheduleAction,
  bookPatientSlotAction,
  createScheduleExceptionAction,
  deleteScheduleExceptionAction,
  generateSlotsAction,
} from "@/lib/actions/doctor-operations-actions";
import { addDays, format } from "date-fns";
import { DoctorScheduleCalendar } from "@/components/sheduling/doctor-schedule-calendar";
import type { PatientScheduleData } from "@/lib/dashboard/doctor-operations-service";
import type { CalendarEvent } from "@/components/sheduling/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FrameDescription, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NEPAL_WORKING_DAYS = "Sunday to Friday";

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

export type DoctorScheduleViewData = {
  scheduleRules: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  scheduleExceptions: Array<{
    id: string;
    date: string;
    type: string;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
  }>;
  upcomingSlots: Array<{
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
  }>;
};

export function DoctorScheduleManager({
  data,
}: {
  data: DoctorScheduleViewData;
}) {
  const today = new Date();
  const defaultStartDate = toDateKey(today);
  const defaultEndDate = toDateKey(addDays(today, 30));

  const firstWeekRule = data.scheduleRules.find((rule) => rule.dayOfWeek !== 6);
  const defaultStartTime = firstWeekRule?.startTime ?? "09:00";
  const defaultEndTime = firstWeekRule?.endTime ?? "17:00";

  const slotEvents: CalendarEvent[] = data.upcomingSlots.map((slot) => ({
    id: slot.id,
    slotId: slot.id,
    slotStatus:
      slot.status === "OPEN" ||
      slot.status === "HELD" ||
      slot.status === "BOOKED" ||
      slot.status === "BLOCKED"
        ? slot.status
        : undefined,
    title:
      slot.status === "BOOKED"
        ? "Booked Session"
        : slot.status === "HELD"
          ? "Reserved Slot"
          : slot.status === "BLOCKED"
            ? "Blocked Slot"
            : "Open Slot",
    description: slot.status,
    start: new Date(slot.startsAt),
    end: new Date(slot.endsAt),
    color:
      slot.status === "BOOKED"
        ? "rose"
        : slot.status === "HELD"
          ? "amber"
          : slot.status === "BLOCKED"
            ? "orange"
            : "sky",
  }));

  const holidayExceptionDates = data.scheduleExceptions
    .filter((item) => item.type === "OFF")
    .map((item) => item.date);

  const blockedDates = Array.from(
    new Set([
      ...buildSaturdayHolidayKeys(),
      ...holidayExceptionDates,
    ]),
  );

  const holidayExceptions = data.scheduleExceptions
    .filter((item) => item.type === "OFF")
    .slice(0, 20);

  return (
    <div className="space-y-4">
      <Frame className="grid gap-1 xl:grid-cols-[360px_1fr]">
        <FramePanel className="space-y-4 p-5">
          <div>
            <FrameTitle>Simple Schedule Setup</FrameTitle>
            <FrameDescription>
              Keep it easy for non-technical doctors. {NEPAL_WORKING_DAYS} are
              working days, Saturday is holiday by default.
            </FrameDescription>
          </div>

          <form action={applyNepalWeeklyScheduleAction} className="grid gap-2">
            <p className="font-at-aero-medium text-sm">Working Hours (Sun-Fri)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                name="startTime"
                required
                type="time"
                defaultValue={defaultStartTime}
              />
              <Input
                name="endTime"
                required
                type="time"
                defaultValue={defaultEndTime}
              />
            </div>
            <Button size="sm" type="submit">
              Apply Sun-Fri Hours
            </Button>
          </form>

          <form action={createScheduleExceptionAction} className="grid gap-2">
            <p className="font-at-aero-medium text-sm">Add Holiday / Closure</p>
            <input type="hidden" name="type" value="OFF" />
            <Input name="date" required type="date" />
            <Input name="reason" placeholder="Reason (optional)" />
            <Button size="sm" type="submit" variant="outline">
              Mark as Holiday
            </Button>
          </form>

          <form action={generateSlotsAction} className="grid gap-2">
            <p className="font-at-aero-medium text-sm">Generate Bookable Slots</p>
            <Input name="startDate" required type="date" defaultValue={defaultStartDate} />
            <Input name="endDate" required type="date" defaultValue={defaultEndDate} />
            <Button size="sm" type="submit">
              Generate Next 30 Days
            </Button>
          </form>

          <div className="rounded-md border p-3">
            <p className="font-at-aero-medium text-sm">Upcoming Slots</p>
            <p className="text-muted-foreground text-xs">
              {data.upcomingSlots.length} generated slots in the upcoming window.
            </p>
          </div>
        </FramePanel>

        <FramePanel className="overflow-hidden p-0">
          <div className="border-b px-5 py-4">
            <FrameTitle>Doctor Schedule Calendar</FrameTitle>
            <FrameDescription>
              Red pattern = holiday/blocked day. Grey pattern = outside current month.
              Use AD/BS switch on the top-right.
            </FrameDescription>
          </div>
          <DoctorScheduleCalendar
            blockedDates={blockedDates}
            className="px-4 pb-4 pt-0"
            events={slotEvents}
            holidayDates={holidayExceptionDates}
          />
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="p-0">
          <div className="border-b px-5 py-4">
            <FrameTitle>Holiday Exceptions</FrameTitle>
            <FrameDescription>
              Includes national or sudden closures added by the doctor team.
            </FrameDescription>
          </div>
          <div className="p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidayExceptions.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDateTime(item.date)}</TableCell>
                    <TableCell>{item.reason || "Holiday / OFF"}</TableCell>
                    <TableCell className="text-right">
                      <form action={deleteScheduleExceptionAction}>
                        <input
                          type="hidden"
                          name="scheduleExceptionId"
                          value={item.id}
                        />
                        <Button size="sm" type="submit" variant="outline">
                          Remove
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
                {holidayExceptions.length === 0 && (
                  <TableRow>
                    <TableCell
                      className="text-center text-muted-foreground"
                      colSpan={3}
                    >
                      No holiday exceptions yet.
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

export function PatientScheduleManager({
  data,
}: {
  data: PatientScheduleData;
}) {
  return (
    <Frame className="grid gap-1 lg:grid-cols-2">
      <FramePanel className="p-0">
        <div className="border-b px-5 py-4">
          <FrameTitle>Available Slots</FrameTitle>
          <FrameDescription>
            Book slots from available doctors.
          </FrameDescription>
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
              {data.availableSlots.map((slot) => (
                <TableRow key={slot.slotId}>
                  <TableCell>{slot.doctorName}</TableCell>
                  <TableCell>{formatDateTime(slot.startsAt)}</TableCell>
                  <TableCell>{formatDateTime(slot.endsAt)}</TableCell>
                  <TableCell className="text-right">
                    <form action={bookPatientSlotAction}>
                      <input type="hidden" name="slotId" value={slot.slotId} />
                      <Button size="sm" type="submit">
                        Book
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {data.availableSlots.length === 0 && (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={4}>
                    No open slots available right now.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </FramePanel>

      <FramePanel className="p-0">
        <div className="border-b px-5 py-4">
          <FrameTitle>My Bookings</FrameTitle>
          <FrameDescription>Recent appointments and their status.</FrameDescription>
        </div>
        <div className="p-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bookedAppointments.map((booking) => (
                <TableRow key={booking.appointmentId}>
                  <TableCell>{booking.doctorName}</TableCell>
                  <TableCell>{formatDateTime(booking.startsAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{booking.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {data.bookedAppointments.length === 0 && (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={3}>
                    No bookings yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </FramePanel>
    </Frame>
  );
}
