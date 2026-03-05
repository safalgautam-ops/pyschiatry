import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getDoctorSessionWorkspaceData } from "@/lib/dashboard/doctor-operations-service";
import {
  sendDoctorSessionMessageAction,
  uploadSessionReportAction,
} from "@/lib/actions/doctor-operations-actions";
import { SessionReportUploadFields } from "./_components/session-report-upload-fields";
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

export default async function DoctorSessionPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const user = await requireAuthenticatedUser();
  if (user.role !== "DOCTOR") {
    redirect("/dashboard");
  }

  const { appointmentId } = await params;
  const data = await getDoctorSessionWorkspaceData(user, appointmentId);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      <Frame className="w-full grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-4">
        <FramePanel className="space-y-4 p-5 m-0!">
          <p className="text-muted-foreground text-xs">Session ID</p>
          <p className="font-mono text-xs">{data.appointment.id}</p>
        </FramePanel>
        <FramePanel className="space-y-4 p-5 m-0!">
          <p className="text-muted-foreground text-xs">Patient</p>
          <p className="font-at-aero-medium text-sm">{data.patient.name}</p>
        </FramePanel>
        <FramePanel className="space-y-4 p-5 m-0!">
          <p className="text-muted-foreground text-xs">Time</p>
          <p className="text-sm">
            {formatDateTime(data.appointment.startsAt)} -{" "}
            {formatDateTime(data.appointment.endsAt)}
          </p>
        </FramePanel>
        <FramePanel className="space-y-4 p-5 m-0!">
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
        <FramePanel className="space-y-4 p-5">
          <div className="space-y-1">
            <FrameTitle>Client Details</FrameTitle>
            <FrameDescription>
              Session-linked patient profile snapshot.
            </FrameDescription>
          </div>
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span>{" "}
              {data.patient.name}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              {data.patient.email}
            </p>
            <p>
              <span className="text-muted-foreground">Phone:</span>{" "}
              {data.patient.phone || "-"}
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-at-aero-medium text-sm">
              Patient message at booking
            </p>
            <div className="text-muted-foreground min-h-24 rounded-md border p-3 text-sm">
              {data.bookingMessage || "No message was left during booking."}
            </div>
          </div>
        </FramePanel>

        <FramePanel className="flex h-[62vh] flex-col p-0 m-0!">
          <div className="border-b px-5 py-4">
            <FrameTitle>Session Chat</FrameTitle>
            <FrameDescription>
              Conversation is scoped to this single appointment session.
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
            action={sendDoctorSessionMessageAction}
            className="grid gap-2 border-t p-4"
          >
            <input
              type="hidden"
              name="appointmentId"
              value={data.appointment.id}
            />
            <Textarea
              name="text"
              placeholder="Write a session message..."
              required
            />
            <Button size="sm" type="submit">
              Send Message
            </Button>
          </form>
        </FramePanel>
      </Frame>

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-cormorant text-xl leading-none">
            Session Reports
          </h1>
          <p className="font-at-aero-regular text-muted-foreground text-sm">
            Upload encrypted reports directly under this appointment session.
          </p>
        </div>
        <div className="flex justify-end">
          <SessionReportUploadFields
            action={uploadSessionReportAction}
            appointmentId={data.appointment.id}
          />
        </div>
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
                <TableCell>
                  <Link
                    className="hover:underline"
                    href={`/api/reports/${report.id}/download`}
                  >
                    {report.originalFileName}
                  </Link>
                </TableCell>
                <TableCell>{formatDateTime(report.createdAt)}</TableCell>
              </TableRow>
            ))}
            {data.reports.length === 0 && (
              <TableRow>
                <TableCell
                  className="text-muted-foreground text-center"
                  colSpan={3}
                >
                  No reports uploaded for this session.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Frame>
    </div>
  );
}
