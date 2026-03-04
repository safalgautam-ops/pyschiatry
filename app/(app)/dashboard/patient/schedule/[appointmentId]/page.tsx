import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPatientSessionWorkspaceData } from "@/lib/dashboard/doctor-operations-service";
import { sendPatientSessionMessageAction } from "@/lib/actions/doctor-operations-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function PatientSessionPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const user = await requireAuthenticatedUser();
  if (user.role !== "PATIENT") {
    redirect("/dashboard");
  }

  const { appointmentId } = await params;
  const data = await getPatientSessionWorkspaceData(user, appointmentId);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      <Frame className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-4">
        <FramePanel className="space-y-2 p-5 h-full m-0!">
          <p className="text-muted-foreground text-xs">Session ID</p>
          <p className="font-mono text-xs">{data.appointment.id}</p>
        </FramePanel>
        <FramePanel className="space-y-2 p-5 h-full m-0!">
          <p className="text-muted-foreground text-xs">Doctor</p>
          <p className="font-at-aero-medium text-sm">{data.doctor.name}</p>
        </FramePanel>
        <FramePanel className="space-y-2 p-5 h-full m-0!">
          <p className="text-muted-foreground text-xs">Time</p>
          <p className="text-sm">
            {formatDateTime(data.appointment.startsAt)} -{" "}
            {formatDateTime(data.appointment.endsAt)}
          </p>
        </FramePanel>
        <FramePanel className="space-y-2 p-5 h-full m-0!">
          <p className="text-muted-foreground text-xs">Status</p>
          <Badge variant="outline">{data.appointment.status}</Badge>
          {data.appointment.status === "CANCELLED" &&
            data.appointment.cancelReason && (
              <p className="text-muted-foreground mt-2 text-xs">
                Reason: {data.appointment.cancelReason}
              </p>
            )}
        </FramePanel>
      </Frame>

      <Frame className="grid w-full gap-1 lg:grid-cols-[340px_1fr]">
        <FramePanel className="space-y-4 p-5 m-0!">
          <div className="space-y-1">
            <FrameTitle>Doctor Details</FrameTitle>
            <FrameDescription>
              For this booked appointment session.
            </FrameDescription>
          </div>
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span>{" "}
              {data.doctor.name}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              {data.doctor.email}
            </p>
            <p>
              <span className="text-muted-foreground">Phone:</span>{" "}
              {data.doctor.phone || "-"}
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-at-aero-medium text-sm">
              Message you left while booking
            </p>
            <div className="text-muted-foreground min-h-24 rounded-md border p-3 text-sm">
              {data.bookingMessage || "No booking message was captured."}
            </div>
          </div>
        </FramePanel>

        <FramePanel className="flex h-[62vh] flex-col p-0 m-0!">
          <div className="border-b px-5 py-4">
            <FrameTitle>Session Chat</FrameTitle>
            <FrameDescription>
              Messaging is scoped to this booked session only.
            </FrameDescription>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {data.messages.map((message) => {
              const mine = message.senderUserId === user.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl border px-3 py-2 ${
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-medium">{message.senderName}</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {message.text}
                    </p>
                    <p className="mt-1 text-[11px] opacity-70">
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            {data.messages.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No messages yet for this session.
              </p>
            )}
          </div>
          <form
            action={sendPatientSessionMessageAction}
            className="grid gap-2 border-t p-4"
          >
            <input
              type="hidden"
              name="appointmentId"
              value={data.appointment.id}
            />
            <Textarea
              name="text"
              placeholder="Write to your doctor..."
              required
            />
            <Button size="sm" type="submit">
              Send Message
            </Button>
          </form>
        </FramePanel>
      </Frame>

      <div className="space-y-1">
        <FrameTitle>Session Reports</FrameTitle>
        <FrameDescription>
          Reports uploaded by your doctor for this appointment.
        </FrameDescription>
      </div>
      <Frame className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{report.title}</TableCell>
                <TableCell>{report.originalFileName}</TableCell>
                <TableCell>{formatDateTime(report.createdAt)}</TableCell>
              </TableRow>
            ))}
            {data.reports.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-muted-foreground text-center"
                  colSpan={3}
                >
                  No reports shared for this session yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Frame>
    </div>
  );
}
