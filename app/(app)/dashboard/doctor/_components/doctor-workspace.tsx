import type { AuthenticatedUser } from "@/lib/auth/session";
import { getDoctorWorkspaceData } from "@/lib/dashboard/doctor-operations-service";
import {
  respondShareAction,
  sendDoctorMessageAction,
  shareReportAction,
  uploadReportAction,
} from "@/lib/actions/doctor-operations-actions";
import { DoctorScheduleManager } from "@/components/sheduling";
import { DoctorBookingsTable } from "./doctor-bookings-table";
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
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import type { ReactNode } from "react";

type DoctorTab = "overview" | "schedule" | "bookings" | "chat" | "reports";

type DoctorWorkspaceProps = {
  user: AuthenticatedUser;
  activeTab: DoctorTab;
  selectedRoomId?: string | null;
};

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MetricPanel({ label, value }: { label: string; value: number }) {
  return (
    <FramePanel className="p-4">
      <FrameDescription>{label}</FrameDescription>
      <p className="mt-2 font-semibold text-3xl">{value}</p>
    </FramePanel>
  );
}

function DoctorOverviewSection({
  counts,
  appointments,
}: {
  counts: {
    patients: number;
    openSlots: number;
    appointments: number;
    reports: number;
    pendingShares: number;
  };
  appointments: Array<{
    id: string;
    patientName: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
  }>;
}) {
  return (
    <div className="space-y-4">
      <Frame className="grid gap-1 md:grid-cols-2 xl:grid-cols-5">
        <MetricPanel label="Total Patients" value={counts.patients} />
        <MetricPanel label="Open Slots" value={counts.openSlots} />
        <MetricPanel label="Active Appointments" value={counts.appointments} />
        <MetricPanel label="Encrypted Reports" value={counts.reports} />
        <MetricPanel label="Pending Shares" value={counts.pendingShares} />
      </Frame>

      <Frame className="grid gap-1 lg:grid-cols-3">
        <FramePanel className="lg:col-span-2 p-0">
          <div className="border-b px-5 py-4">
            <FrameTitle>Upcoming Appointments</FrameTitle>
            <FrameDescription>
              Booked and confirmed appointments in your tenant.
            </FrameDescription>
          </div>
          <div className="space-y-2 p-5">
            {appointments.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <p className="font-medium">{item.patientName}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateTime(item.startsAt)} - {formatDateTime(item.endsAt)}
                  </p>
                </div>
                <Badge variant="outline">{item.status}</Badge>
              </div>
            ))}
            {appointments.length === 0 && (
              <p className="text-muted-foreground text-sm">No appointments yet.</p>
            )}
          </div>
        </FramePanel>

        <FramePanel className="p-5">
          <FrameTitle>Quick Navigate</FrameTitle>
          <div className="mt-3 grid gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/doctor/schedule">Manage Schedule</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/doctor/bookings">Manage Bookings</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/doctor/chat">Open Chat</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/doctor/reports">Reports</Link>
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function DoctorBookingsSection({
  appointments,
}: {
  appointments: Array<{
    id: string;
    patientName: string;
    status: string;
    cancelReason: string | null;
    startsAt: Date;
    endsAt: Date;
  }>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-cormorant text-2xl leading-none">Booking Management</h2>
      <p className="font-at-aero-regular text-muted-foreground text-sm">
        Change status directly from the dropdown. Cancellation asks reason first.
      </p>
      <Frame className="w-full">
        <DoctorBookingsTable appointments={appointments} />
      </Frame>
    </section>
  );
}

function DoctorChatSection({
  userId,
  selectedRoomId,
  rooms,
  messages,
}: {
  userId: string;
  selectedRoomId: string | null;
  rooms: Array<{
    id: string;
    patientName: string;
    lastMessageAt: Date | null;
    latestMessage: string | null;
  }>;
  messages: Array<{
    id: string;
    senderUserId: string;
    senderName: string;
    text: string;
    createdAt: Date;
  }>;
}) {
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

  return (
    <Frame className="grid gap-1 lg:grid-cols-[320px_1fr]">
      <FramePanel className="p-0">
        <div className="border-b px-5 py-4">
          <FrameTitle>Conversations</FrameTitle>
          <FrameDescription>
            This list is auto-created from booked appointments.
          </FrameDescription>
        </div>
        <div className="space-y-1 p-2">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/dashboard/doctor/chat/${room.id}`}
              className={`block rounded-lg border px-3 py-3 transition-colors hover:bg-muted/40 ${
                room.id === selectedRoomId ? "bg-muted/60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{room.patientName}</p>
                <span className="text-muted-foreground text-[11px]">
                  {formatDateTime(room.lastMessageAt)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                {room.latestMessage ?? "No messages yet"}
              </p>
            </Link>
          ))}
          {rooms.length === 0 && (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              No patient chats yet. A chat appears after booking.
            </p>
          )}
        </div>
      </FramePanel>

      <FramePanel className="flex h-[68vh] flex-col p-0">
        <div className="border-b px-5 py-4">
          <FrameTitle>{selectedRoom?.patientName ?? "Select Conversation"}</FrameTitle>
          <FrameDescription>Doctor to patient direct chat only.</FrameDescription>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.map((message) => {
            const mine = message.senderUserId === userId;
            return (
              <div
                key={message.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl border px-3 py-2 ${
                    mine ? "bg-primary text-primary-foreground" : "bg-muted/40"
                  }`}
                >
                  <p className="text-xs font-medium">{message.senderName}</p>
                  <p className="mt-1 text-sm">{message.text}</p>
                  <p className="mt-1 text-[11px] opacity-70">
                    {formatDateTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <p className="text-muted-foreground text-sm">No messages in this chat.</p>
          )}
        </div>
        <form action={sendDoctorMessageAction} className="grid gap-2 border-t p-4">
          <input type="hidden" name="roomId" value={selectedRoomId ?? ""} />
          <Textarea name="text" placeholder="Type a message..." required />
          <Button size="sm" type="submit" disabled={!selectedRoomId}>
            Send Message
          </Button>
        </form>
      </FramePanel>
    </Frame>
  );
}

function DoctorReportsSection({
  patients,
  reports,
  doctorOptions,
  incomingShares,
}: {
  patients: Array<{ userId: string; name: string }>;
  reports: Array<{
    id: string;
    title: string;
    patientName: string;
    createdAt: Date;
  }>;
  doctorOptions: Array<{ id: string; name: string }>;
  incomingShares: Array<{
    id: string;
    documentTitle: string;
    fromDoctorName: string;
  }>;
}) {
  return (
    <div className="space-y-4">
      <Frame className="grid gap-1 lg:grid-cols-2">
        <FramePanel className="p-5">
          <FrameTitle>Upload Encrypted Report</FrameTitle>
          <FrameDescription>
            Uploaded file is encrypted and key-wrapped per authorized user.
          </FrameDescription>
          <form action={uploadReportAction} className="mt-3 grid gap-2">
            <Input name="title" placeholder="Report title" required />
            <select
              name="patientUserId"
              required
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">Select patient</option>
              {patients.map((patient) => (
                <option key={patient.userId} value={patient.userId}>
                  {patient.name}
                </option>
              ))}
            </select>
            <Input name="appointmentId" placeholder="Appointment ID (optional)" />
            <Input name="file" required type="file" />
            <Button type="submit">Upload Report</Button>
          </form>
        </FramePanel>

        <FramePanel className="p-0">
          <div className="border-b px-5 py-4">
            <FrameTitle>Incoming Shares</FrameTitle>
          </div>
          <div className="space-y-2 p-5">
            {incomingShares.map((share) => (
              <div key={share.id} className="rounded-md border px-3 py-2">
                <p className="font-medium">{share.documentTitle}</p>
                <p className="text-muted-foreground text-xs">From: {share.fromDoctorName}</p>
                <div className="mt-2 flex gap-2">
                  <form action={respondShareAction}>
                    <input type="hidden" name="shareId" value={share.id} />
                    <input type="hidden" name="decision" value="ACCEPTED" />
                    <Button size="sm" type="submit">
                      Accept
                    </Button>
                  </form>
                  <form action={respondShareAction}>
                    <input type="hidden" name="shareId" value={share.id} />
                    <input type="hidden" name="decision" value="REJECTED" />
                    <Button size="sm" type="submit" variant="outline">
                      Reject
                    </Button>
                  </form>
                </div>
              </div>
            ))}
            {incomingShares.length === 0 && (
              <p className="text-muted-foreground text-sm">No incoming shares.</p>
            )}
          </div>
        </FramePanel>
      </Frame>

      <section className="space-y-2">
        <h2 className="font-cormorant text-2xl leading-none">Reports and Sharing</h2>
        <p className="font-at-aero-regular text-muted-foreground text-sm">
          Encrypted reports with controlled doctor-to-doctor sharing.
        </p>
        <Frame className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{report.title}</TableCell>
                  <TableCell>{report.patientName}</TableCell>
                  <TableCell>{formatDateTime(report.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <form action={shareReportAction} className="flex justify-end gap-2">
                      <input type="hidden" name="documentId" value={report.id} />
                      <select
                        name="toDoctorUserId"
                        required
                        className="h-9 rounded-md border bg-transparent px-3 text-sm"
                      >
                        <option value="">Select doctor</option>
                        {doctorOptions.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.name}
                          </option>
                        ))}
                      </select>
                      <Input name="note" placeholder="Note" className="w-40" />
                      <Button size="sm" type="submit" variant="outline">
                        Share
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {reports.length === 0 && (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={4}>
                    No encrypted reports uploaded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Frame>
      </section>
    </div>
  );
}

export async function DoctorWorkspace({
  user,
  activeTab,
  selectedRoomId,
}: DoctorWorkspaceProps) {
  const data = await getDoctorWorkspaceData(user, selectedRoomId ?? null);

  let content: ReactNode = null;
  if (activeTab === "overview") {
    content = (
      <DoctorOverviewSection counts={data.counts} appointments={data.appointments} />
    );
  } else if (activeTab === "schedule") {
    content = (
      <DoctorScheduleManager
        data={{
          scheduleRules: data.scheduleRules,
          scheduleExceptions: data.scheduleExceptions,
          upcomingSlots: data.upcomingSlots,
        }}
      />
    );
  } else if (activeTab === "bookings") {
    content = <DoctorBookingsSection appointments={data.appointments} />;
  } else if (activeTab === "chat") {
    content = (
      <DoctorChatSection
        userId={user.id}
        selectedRoomId={data.selectedRoomId}
        rooms={data.chatRooms.map((room) => ({
          id: room.id,
          patientName: room.patientName,
          lastMessageAt: room.lastMessageAt,
          latestMessage: room.latestMessage,
        }))}
        messages={data.selectedRoomMessages}
      />
    );
  } else if (activeTab === "reports") {
    content = (
      <DoctorReportsSection
        patients={data.patients.map((patient) => ({
          userId: patient.userId,
          name: patient.name,
        }))}
        reports={data.reports.map((report) => ({
          id: report.id,
          title: report.title,
          patientName: report.patientName,
          createdAt: report.createdAt,
        }))}
        doctorOptions={data.doctorOptions.map((doctor) => ({
          id: doctor.id,
          name: doctor.name,
        }))}
        incomingShares={data.incomingShares.map((share) => ({
          id: share.id,
          documentTitle: share.documentTitle,
          fromDoctorName: share.fromDoctorName,
        }))}
      />
    );
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      {content}
    </div>
  );
}
