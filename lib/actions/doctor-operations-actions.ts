"use server";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  applyNepalDefaultWeeklySchedule,
  bookPatientAppointmentSlot,
  clearDoctorHolidayByDate,
  createManualSlot,
  deleteScheduleException,
  deleteDoctorSlot,
  createScheduleException,
  createScheduleRule,
  deleteScheduleRule,
  generateSlotsFromRules,
  markDoctorHolidayByDate,
  requestDocumentShare,
  resolveReportAccessRecoveryRequest,
  respondToIncomingShare,
  sendDoctorChatMessage,
  sendDoctorSessionMessage,
  sendPatientChatMessage,
  sendPatientSessionMessage,
  setStaffReportVisibility,
  setDoctorSlotStatus,
  updateAppointmentStatus,
  uploadSessionReport,
  uploadEncryptedReport,
} from "@/lib/dashboard/doctor-operations-service";
import { revalidatePath } from "next/cache";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date/time.");
  }
  return date;
}

function revalidateDoctorPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/doctor");
  revalidatePath("/dashboard/doctor/schedule");
  revalidatePath("/dashboard/doctor/bookings");
  revalidatePath("/dashboard/doctor/bookings/[appointmentId]", "page");
  revalidatePath("/dashboard/patient/schedule/[appointmentId]", "page");
}

function revalidateSchedulePaths() {
  revalidateDoctorPaths();
  revalidatePath("/dashboard/patient");
  revalidatePath("/dashboard/patient/schedule");
}

export async function createScheduleRuleAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await createScheduleRule(user, {
    dayOfWeek: Number(asString(formData.get("dayOfWeek"))),
    startTime: asString(formData.get("startTime")),
    endTime: asString(formData.get("endTime")),
  });
  revalidateDoctorPaths();
}

export async function applyNepalWeeklyScheduleAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await applyNepalDefaultWeeklySchedule(user, {
    startTime: asString(formData.get("startTime")),
    endTime: asString(formData.get("endTime")),
  });
  revalidateDoctorPaths();
}

export async function deleteScheduleRuleAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await deleteScheduleRule(user, asString(formData.get("scheduleRuleId")));
  revalidateDoctorPaths();
}

export async function createScheduleExceptionAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const type = asString(formData.get("type"));
  await createScheduleException(user, {
    date: asString(formData.get("date")),
    type: type === "CUSTOM_HOURS" ? "CUSTOM_HOURS" : "OFF",
    startTime: asString(formData.get("startTime")) || undefined,
    endTime: asString(formData.get("endTime")) || undefined,
    reason: asString(formData.get("reason")) || undefined,
  });
  revalidateDoctorPaths();
}

export async function markDoctorHolidayAction(input: {
  date: string;
  reason?: string;
}) {
  const user = await requireAuthenticatedUser();
  await markDoctorHolidayByDate(user, input);
  revalidateSchedulePaths();
}

export async function clearDoctorHolidayAction(input: { date: string }) {
  const user = await requireAuthenticatedUser();
  await clearDoctorHolidayByDate(user, input);
  revalidateSchedulePaths();
}

export async function setDoctorSlotStatusAction(input: {
  slotId: string;
  status: "OPEN" | "HELD" | "BLOCKED";
}) {
  const user = await requireAuthenticatedUser();
  await setDoctorSlotStatus(user, input);
  revalidateSchedulePaths();
}

export async function deleteDoctorSlotAction(input: { slotId: string }) {
  const user = await requireAuthenticatedUser();
  await deleteDoctorSlot(user, input);
  revalidateSchedulePaths();
}

export async function deleteScheduleExceptionAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await deleteScheduleException(user, asString(formData.get("scheduleExceptionId")));
  revalidateDoctorPaths();
}

export async function generateSlotsAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await generateSlotsFromRules(user, {
    startDate: asString(formData.get("startDate")),
    endDate: asString(formData.get("endDate")),
  });
  revalidateDoctorPaths();
}

export async function createManualSlotAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await createManualSlot(user, {
    startsAt: toLocalDateTime(asString(formData.get("startsAt"))),
    endsAt: toLocalDateTime(asString(formData.get("endsAt"))),
  });
  revalidateDoctorPaths();
}

export async function bookPatientSlotAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const bookingMessage = asString(formData.get("bookingMessage")).trim();
  await bookPatientAppointmentSlot(user, {
    slotId: asString(formData.get("slotId")),
    bookingMessage: bookingMessage || undefined,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/patient");
  revalidatePath("/dashboard/patient/schedule");
  revalidatePath("/dashboard/doctor");
  revalidatePath("/dashboard/doctor/schedule");
  revalidatePath("/dashboard/doctor/bookings");
}

export async function updateAppointmentStatusAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const status = asString(formData.get("status"));
  if (
    status !== "BOOKED" &&
    status !== "CONFIRMED" &&
    status !== "CANCELLED" &&
    status !== "COMPLETED"
  ) {
    throw new Error("Invalid appointment status.");
  }

  await updateAppointmentStatus(user, {
    appointmentId: asString(formData.get("appointmentId")),
    status,
    cancelReason: asString(formData.get("cancelReason")) || undefined,
  });
  revalidateDoctorPaths();
}

export async function sendDoctorMessageAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await sendDoctorChatMessage(user, {
    roomId: asString(formData.get("roomId")),
    text: asString(formData.get("text")),
  });
  revalidateDoctorPaths();
}

export async function sendPatientMessageAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await sendPatientChatMessage(user, {
    roomId: asString(formData.get("roomId")),
    text: asString(formData.get("text")),
  });
  revalidatePath("/dashboard/patient/schedule");
}

export async function sendDoctorSessionMessageAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const appointmentId = asString(formData.get("appointmentId"));
  await sendDoctorSessionMessage(user, {
    appointmentId,
    text: asString(formData.get("text")),
  });
  revalidateDoctorPaths();
  revalidatePath(`/dashboard/doctor/bookings/${appointmentId}`);
  revalidatePath(`/dashboard/patient/schedule/${appointmentId}`);
}

export async function sendPatientSessionMessageAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const appointmentId = asString(formData.get("appointmentId"));
  await sendPatientSessionMessage(user, {
    appointmentId,
    text: asString(formData.get("text")),
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/patient/schedule");
  revalidatePath(`/dashboard/patient/schedule/${appointmentId}`);
  revalidatePath(`/dashboard/doctor/bookings/${appointmentId}`);
  revalidatePath("/dashboard/doctor/bookings");
}

export async function uploadReportAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    throw new Error("Report file is required.");
  }

  const bytes = Buffer.from(await fileValue.arrayBuffer());
  await uploadEncryptedReport(user, {
    patientUserId: asString(formData.get("patientUserId")),
    title: asString(formData.get("title")),
    fileName: fileValue.name,
    mimeType: fileValue.type,
    fileBuffer: bytes,
    appointmentId: asString(formData.get("appointmentId")) || null,
  });
  revalidateDoctorPaths();
}

export async function uploadSessionReportAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const appointmentId = asString(formData.get("appointmentId"));
  const titleFromSingle = asString(formData.get("title")).trim();

  const rawTitlesJson = asString(formData.get("titlesJson"));
  let parsedTitles: string[] = [];
  if (rawTitlesJson) {
    try {
      const value = JSON.parse(rawTitlesJson);
      if (Array.isArray(value)) {
        parsedTitles = value.map((item) =>
          typeof item === "string" ? item.trim() : "",
        );
      }
    } catch {
      parsedTitles = [];
    }
  }

  const filesFromMulti = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);

  const singleFileValue = formData.get("file");
  const files =
    filesFromMulti.length > 0
      ? filesFromMulti
      : singleFileValue instanceof File && singleFileValue.size > 0
        ? [singleFileValue]
        : [];

  if (files.length === 0) {
    throw new Error("Report file is required.");
  }

  for (const [index, file] of files.entries()) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const fallbackTitle = file.name.replace(/\.[^/.]+$/, "") || file.name;
    const resolvedTitle =
      parsedTitles[index] || titleFromSingle || fallbackTitle;

    await uploadSessionReport(user, {
      appointmentId,
      title: resolvedTitle,
      fileName: file.name,
      mimeType: file.type,
      fileBuffer: bytes,
    });
  }

  revalidateDoctorPaths();
  revalidatePath(`/dashboard/doctor/bookings/${appointmentId}`);
  revalidatePath(`/dashboard/patient/schedule/${appointmentId}`);
}

export async function shareReportAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await requestDocumentShare(user, {
    documentId: asString(formData.get("documentId")),
    toDoctorUserId: asString(formData.get("toDoctorUserId")),
    note: asString(formData.get("note")) || undefined,
  });
  revalidateDoctorPaths();
}

export async function respondShareAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const decision = asString(formData.get("decision"));
  await respondToIncomingShare(user, {
    shareId: asString(formData.get("shareId")),
    decision: decision === "ACCEPTED" ? "ACCEPTED" : "REJECTED",
  });
  revalidateDoctorPaths();
}

export async function setStaffReportVisibilityAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await setStaffReportVisibility(user, {
    documentId: asString(formData.get("documentId")),
    staffUserId: asString(formData.get("staffUserId")),
    visible: asString(formData.get("visible")) === "true",
  });
  revalidateDoctorPaths();
}

export async function resolveReportRecoveryRequestAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const decisionRaw = asString(formData.get("decision"));
  await resolveReportAccessRecoveryRequest(user, {
    requestId: asString(formData.get("requestId")),
    decision: decisionRaw === "APPROVE" ? "APPROVE" : "REJECT",
  });
  revalidateDoctorPaths();
}
