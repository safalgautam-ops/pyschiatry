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
  respondToIncomingShare,
  sendDoctorChatMessage,
  sendPatientChatMessage,
  setDoctorSlotStatus,
  updateAppointmentStatus,
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
  revalidatePath("/dashboard/doctor/chat");
  revalidatePath("/dashboard/doctor/reports");
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
  revalidatePath("/dashboard/patient/chat");
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
  revalidatePath("/dashboard/patient/chat");
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
