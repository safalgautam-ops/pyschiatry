"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateAppointmentStatusAction } from "@/lib/actions/doctor-operations-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type AppointmentStatus = "BOOKED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

type DoctorBookingRow = {
  id: string;
  patientUserId?: string;
  patientName: string;
  patientEmail?: string;
  status: string;
  cancelReason: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
};

type DoctorBookingsTableProps = {
  appointments: DoctorBookingRow[];
  sessionHrefBase?: string;
};

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeStatus(value: string): AppointmentStatus {
  if (
    value === "BOOKED" ||
    value === "CONFIRMED" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  ) {
    return value;
  }
  return "BOOKED";
}

function mapStatuses(rows: DoctorBookingRow[]) {
  return Object.fromEntries(
    rows.map((row) => [row.id, normalizeStatus(row.status)]),
  ) as Record<string, AppointmentStatus>;
}

function mapReasons(rows: DoctorBookingRow[]) {
  return Object.fromEntries(
    rows.map((row) => [row.id, row.cancelReason ?? ""]),
  ) as Record<string, string>;
}

export function DoctorBookingsTable({
  appointments,
  sessionHrefBase = "/dashboard/doctor/bookings",
}: DoctorBookingsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [statusById, setStatusById] = useState<Record<string, AppointmentStatus>>(
    () => mapStatuses(appointments),
  );
  const [reasonById, setReasonById] = useState<Record<string, string>>(
    () => mapReasons(appointments),
  );

  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean;
    appointmentId: string | null;
    reason: string;
  }>({
    open: false,
    appointmentId: null,
    reason: "",
  });

  useEffect(() => {
    setStatusById(mapStatuses(appointments));
    setReasonById(mapReasons(appointments));
  }, [appointments]);

  const activeCancelPatientName = useMemo(() => {
    if (!cancelDialog.appointmentId) return "";
    return (
      appointments.find((item) => item.id === cancelDialog.appointmentId)
        ?.patientName ?? ""
    );
  }, [appointments, cancelDialog.appointmentId]);

  const submitStatus = (
    appointmentId: string,
    status: AppointmentStatus,
    cancelReason?: string,
  ) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("appointmentId", appointmentId);
      formData.set("status", status);
      if (status === "CANCELLED" && cancelReason?.trim()) {
        formData.set("cancelReason", cancelReason.trim());
      }

      try {
        await updateAppointmentStatusAction(formData);
        toast.success(
          status === "CANCELLED"
            ? "Appointment cancelled."
            : "Appointment status updated.",
        );
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Unable to update appointment.";
        toast.error(message);
        router.refresh();
      }
    });
  };

  const handleStatusChange = (appointmentId: string, nextStatus: AppointmentStatus) => {
    const previousStatus = statusById[appointmentId] ?? "BOOKED";
    if (nextStatus === previousStatus) return;

    if (nextStatus === "CANCELLED") {
      setCancelDialog({
        open: true,
        appointmentId,
        reason: reasonById[appointmentId] ?? "",
      });
      return;
    }

    setStatusById((prev) => ({ ...prev, [appointmentId]: nextStatus }));
    setReasonById((prev) => ({ ...prev, [appointmentId]: "" }));
    submitStatus(appointmentId, nextStatus);
  };

  const confirmCancellation = () => {
    const appointmentId = cancelDialog.appointmentId;
    if (!appointmentId) return;

    const reason = cancelDialog.reason.trim();
    if (!reason) {
      toast.error("Cancellation reason is required.");
      return;
    }

    setStatusById((prev) => ({ ...prev, [appointmentId]: "CANCELLED" }));
    setReasonById((prev) => ({ ...prev, [appointmentId]: reason }));
    setCancelDialog({
      open: false,
      appointmentId: null,
      reason: "",
    });
    submitStatus(appointmentId, "CANCELLED", reason);
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cancel Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((item) => {
            const currentStatus = statusById[item.id] ?? normalizeStatus(item.status);
            const cancelReason = reasonById[item.id];
            return (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">
                  <Link
                    className="font-at-aero-medium text-foreground hover:underline"
                    href={`${sessionHrefBase}/${item.id}`}
                  >
                    {item.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    className="font-at-aero-medium text-foreground hover:underline"
                    href={`${sessionHrefBase}/${item.id}`}
                  >
                    {item.patientName}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {item.patientEmail ?? "-"}
                  </p>
                </TableCell>
                <TableCell>{formatDateTime(item.startsAt)}</TableCell>
                <TableCell>{formatDateTime(item.endsAt)}</TableCell>
                <TableCell>
                  <Select
                    onValueChange={(value) =>
                      handleStatusChange(item.id, normalizeStatus(value))
                    }
                    value={currentStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" position="popper">
                      <SelectItem value="BOOKED">BOOKED</SelectItem>
                      <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                      <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                      <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {currentStatus === "CANCELLED" && cancelReason
                    ? cancelReason
                    : "-"}
                </TableCell>
              </TableRow>
            );
          })}
          {appointments.length === 0 && (
            <TableRow>
              <TableCell className="text-center text-muted-foreground" colSpan={6}>
                No appointment records yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <AlertDialog
        onOpenChange={(open) =>
          setCancelDialog((prev) => ({
            ...prev,
            open,
            appointmentId: open ? prev.appointmentId : null,
            reason: open ? prev.reason : "",
          }))
        }
        open={cancelDialog.open}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              {activeCancelPatientName
                ? `Add a cancellation reason for ${activeCancelPatientName}.`
                : "Add a cancellation reason for this appointment."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cancelReason">Cancel reason</Label>
            <Input
              id="cancelReason"
              onChange={(event) =>
                setCancelDialog((prev) => ({
                  ...prev,
                  reason: event.target.value,
                }))
              }
              placeholder="Reason for cancelling this appointment"
              value={cancelDialog.reason}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmCancellation();
              }}
            >
              Confirm Cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
