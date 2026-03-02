import {
  bookPatientSlotAction,
  createManualSlotAction,
  createScheduleExceptionAction,
  createScheduleRuleAction,
  deleteScheduleRuleAction,
  generateSlotsAction,
} from "@/lib/actions/doctor-operations-actions";
import type { PatientScheduleData } from "@/lib/dashboard/doctor-operations-service";
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
  return (
    <Frame className="grid gap-1 lg:grid-cols-3">
      <FramePanel className="p-5">
        <FrameTitle>Add Rule</FrameTitle>
        <FrameDescription>Define weekly doctor availability windows.</FrameDescription>
        <form action={createScheduleRuleAction} className="mt-3 grid gap-2">
          <select
            name="dayOfWeek"
            required
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {DAY_NAMES.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
          <Input name="startTime" required type="time" />
          <Input name="endTime" required type="time" />
          <Button size="sm" type="submit">
            Save Rule
          </Button>
        </form>
      </FramePanel>

      <FramePanel className="p-5">
        <FrameTitle>Add Exception</FrameTitle>
        <FrameDescription>Block day or use custom hours for one date.</FrameDescription>
        <form action={createScheduleExceptionAction} className="mt-3 grid gap-2">
          <Input name="date" required type="date" />
          <select
            name="type"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="OFF">OFF</option>
            <option value="CUSTOM_HOURS">CUSTOM_HOURS</option>
          </select>
          <Input name="startTime" type="time" />
          <Input name="endTime" type="time" />
          <Input name="reason" placeholder="Reason (optional)" />
          <Button size="sm" type="submit">
            Save Exception
          </Button>
        </form>
      </FramePanel>

      <FramePanel className="p-5">
        <FrameTitle>Generate Slots</FrameTitle>
        <FrameDescription>Create bookable slots from rules.</FrameDescription>
        <form action={generateSlotsAction} className="mt-3 grid gap-2">
          <Input name="startDate" required type="date" />
          <Input name="endDate" required type="date" />
          <Button size="sm" type="submit">
            Generate
          </Button>
        </form>
        <form action={createManualSlotAction} className="mt-4 grid gap-2 border-t pt-4">
          <Input name="startsAt" required type="datetime-local" />
          <Input name="endsAt" required type="datetime-local" />
          <Button size="sm" type="submit" variant="outline">
            Add Manual Slot
          </Button>
        </form>
      </FramePanel>

      <FramePanel className="lg:col-span-2 p-0">
        <div className="border-b px-5 py-4">
          <FrameTitle>Schedule Rules</FrameTitle>
          <FrameDescription>Weekly availability currently active.</FrameDescription>
        </div>
        <div className="p-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.scheduleRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{DAY_NAMES[rule.dayOfWeek] ?? rule.dayOfWeek}</TableCell>
                  <TableCell>
                    {rule.startTime} - {rule.endTime}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={deleteScheduleRuleAction}>
                      <input type="hidden" name="scheduleRuleId" value={rule.id} />
                      <Button size="sm" type="submit" variant="outline">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {data.scheduleRules.length === 0 && (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={3}>
                    No rules configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </FramePanel>

      <FramePanel className="p-0">
        <div className="border-b px-5 py-4">
          <FrameTitle>Upcoming Slots</FrameTitle>
          <FrameDescription>Generated slots for patient booking.</FrameDescription>
        </div>
        <div className="p-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Start</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.upcomingSlots.slice(0, 20).map((slot) => (
                <TableRow key={slot.id}>
                  <TableCell>{formatDateTime(slot.startsAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{slot.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {data.upcomingSlots.length === 0 && (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={2}>
                    No slots available.
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
            Book slots from doctors you are linked with.
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
