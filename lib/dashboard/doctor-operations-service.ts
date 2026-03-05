import { db } from "@/db";
import {
  appointmentSlots,
  appointments,
  chatMessages,
  chatParticipants,
  chatRooms,
  doctorPatients,
  doctorProfile,
  doctorStaff,
  documentAccess,
  documentKeyrings,
  documents,
  documentShares,
  reportAccessRequestItems,
  reportAccessRequests,
  scheduleExceptions,
  scheduleRules,
  user,
  userKeys,
} from "@/drizzle";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  sendAppointmentBookedToDoctorEmail,
  sendAppointmentBookedToPatientEmail,
  sendAppointmentBookedToStaffEmail,
  sendAppointmentConfirmedEmailToPatient,
  sendMailSafely,
  sendReportShareRequestEmailToDoctor,
  sendReportUploadedEmailToPatient,
} from "@/lib/mailer";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  like,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emitChatRealtimeAndBuffer,
  getBufferedChatMessagesByRoomIds,
  getBufferedChatMessagesForRoom,
  maybeFlushBufferedChatMessages,
} from "@/lib/chat-buffer";

const ACTIVE_PATIENT_LINK_STATUSES = ["ACTIVE"] as const;
const CHAT_ELIGIBLE_APPOINTMENT_STATUSES = [
  "BOOKED",
  "CONFIRMED",
  "COMPLETED",
] as const;
const CALENDAR_SLOT_WINDOW_DAYS = 90;
const CALENDAR_SLOT_FETCH_LIMIT = 250;
const SESSION_ROOM_TYPE = "APPOINTMENT_SESSION";
const REPORT_WRAP_SECRET =
  process.env.REPORT_DEK_WRAP_SECRET ??
  process.env.USER_KEYS_ENCRYPTION_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  process.env.AUTH_SECRET ??
  "development-only-report-wrap-secret";

export type AppointmentStatus =
  | "BOOKED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED";

export type DoctorBookingPeriod =
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "TODAY"
  | "SPECIFIC_DAY"
  | "SPECIFIC_WEEK"
  | "SPECIFIC_MONTH"
  | "ALL";

export type DoctorBookingsFilter = {
  period?: DoctorBookingPeriod;
  day?: string;
  week?: string;
  month?: string;
  status?: AppointmentStatus | "ALL";
  patientQuery?: string;
};

export type DoctorBookingListRow = {
  id: string;
  patientUserId: string;
  patientName: string;
  patientEmail: string;
  status: AppointmentStatus;
  cancelReason: string | null;
  startsAt: Date;
  endsAt: Date;
};

export type SessionChatMessage = {
  id: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAt: Date;
};

export type SessionReportRow = {
  id: string;
  title: string;
  originalFileName: string;
  createdAt: Date;
};

export type DoctorWorkspaceData = {
  counts: {
    patients: number;
    openSlots: number;
    appointments: number;
    reports: number;
    pendingShares: number;
  };
  patients: Array<{ userId: string; name: string; email: string; status: string }>;
  staffMembers: Array<{
    userId: string;
    name: string;
    email: string;
    staffRole: string;
    isActive: boolean;
  }>;
  scheduleRules: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>;
  scheduleExceptions: Array<{
    id: string;
    date: string;
    type: string;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
  }>;
  upcomingSlots: Array<{ id: string; startsAt: Date; endsAt: Date; status: string }>;
  appointments: Array<{
    id: string;
    patientUserId: string;
    patientName: string;
    status: string;
    cancelReason: string | null;
    startsAt: Date;
    endsAt: Date;
  }>;
  chatRooms: Array<{
    id: string;
    patientUserId: string | null;
    patientName: string;
    type: string;
    lastMessageAt: Date | null;
    latestMessage: string | null;
  }>;
  selectedRoomMessages: Array<{
    id: string;
    senderUserId: string;
    senderName: string;
    text: string;
    createdAt: Date;
  }>;
  selectedRoomId: string | null;
  reports: Array<{
    id: string;
    title: string;
    patientUserId: string;
    patientName: string;
    originalFileName: string;
    createdAt: Date;
  }>;
  outgoingShares: Array<{
    id: string;
    documentId: string;
    documentTitle: string;
    toDoctorUserId: string;
    toDoctorName: string;
    status: string;
    createdAt: Date;
  }>;
  incomingShares: Array<{
    id: string;
    documentId: string;
    documentTitle: string;
    fromDoctorUserId: string;
    fromDoctorName: string;
    status: string;
    createdAt: Date;
  }>;
  doctorOptions: Array<{ id: string; name: string; email: string }>;
};

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function intervalsOverlap(
  left: { startsAt: Date; endsAt: Date },
  right: { startsAt: Date; endsAt: Date },
) {
  return (
    left.startsAt.getTime() < right.endsAt.getTime() &&
    left.endsAt.getTime() > right.startsAt.getTime()
  );
}

export function parseTimeToMinutes(value: string) {
  const [hourPart, minutePart] = value.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Time must use HH:mm format.");
  }
  return hour * 60 + minute;
}

export function withTime(date: Date, hhmm: string) {
  const [hourPart, minutePart] = hhmm.split(":");
  const value = new Date(date);
  value.setHours(Number(hourPart), Number(minutePart), 0, 0);
  return value;
}

function toSessionMessageFromBuffered(input: {
  id: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAt: Date;
}): SessionChatMessage {
  return {
    id: input.id,
    senderUserId: input.senderUserId,
    senderName: input.senderName,
    text: input.text,
    createdAt: input.createdAt,
  };
}

function mergeSessionMessages(
  persisted: SessionChatMessage[],
  buffered: SessionChatMessage[],
) {
  const byId = new Map<string, SessionChatMessage>();
  for (const item of persisted) {
    byId.set(item.id, item);
  }
  for (const item of buffered) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function normalizeBookingStatus(value: string): AppointmentStatus {
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

function parseIsoDay(value: string | undefined) {
  if (!value) return null;
  const parsed = parseISO(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseIsoWeek(value: string | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week)) return null;
  if (week < 1 || week > 53) return null;

  // ISO week: week containing Jan 4th is week 1, week starts Monday.
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() === 0 ? 7 : jan4.getDay();
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setDate(jan4.getDate() - jan4Day + 1);
  weekOneMonday.setHours(0, 0, 0, 0);
  weekOneMonday.setDate(weekOneMonday.getDate() + (week - 1) * 7);
  return weekOneMonday;
}

function parseIsoMonth(value: string | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;

  const parsed = new Date(year, month - 1, 1);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function resolveDoctorBookingsRange(filter: DoctorBookingsFilter) {
  const period = filter.period ?? "THIS_MONTH";
  const now = new Date();

  if (period === "ALL") return null;
  if (period === "TODAY") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (period === "THIS_WEEK") {
    return {
      start: startOfWeek(now, { weekStartsOn: 1 }),
      end: endOfWeek(now, { weekStartsOn: 1 }),
    };
  }
  if (period === "THIS_MONTH") {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  if (period === "SPECIFIC_DAY") {
    const parsed = parseIsoDay(filter.day);
    return parsed
      ? { start: startOfDay(parsed), end: endOfDay(parsed) }
      : { start: startOfDay(now), end: endOfDay(now) };
  }
  if (period === "SPECIFIC_WEEK") {
    const parsed = parseIsoWeek(filter.week);
    if (!parsed) {
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfWeek(parsed, { weekStartsOn: 1 }),
      end: endOfWeek(parsed, { weekStartsOn: 1 }),
    };
  }
  const parsedMonth = parseIsoMonth(filter.month);
  const start = parsedMonth ?? startOfMonth(now);
  return { start: startOfMonth(start), end: endOfMonth(start) };
}

export async function requireDoctor(currentUser: AuthenticatedUser) {
  if (currentUser.role !== "DOCTOR") {
    throw new Error("Only doctors can access this workspace.");
  }
  return currentUser.id;
}

export async function ensureLinkedPatient(
  doctorUserId: string,
  patientUserId: string,
) {
  const [link] = await db
    .select({ id: doctorPatients.id })
    .from(doctorPatients)
    .where(
      and(
        eq(doctorPatients.doctorUserId, doctorUserId),
        eq(doctorPatients.patientUserId, patientUserId),
        inArray(doctorPatients.status, [...ACTIVE_PATIENT_LINK_STATUSES]),
      ),
    )
    .limit(1);
  if (!link) throw new Error("Patient is not linked to this doctor tenant.");
}

async function ensureBookedAppointmentPair(
  doctorUserId: string,
  patientUserId: string,
) {
  const [row] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorUserId, doctorUserId),
        eq(appointments.patientUserId, patientUserId),
        inArray(appointments.status, [...CHAT_ELIGIBLE_APPOINTMENT_STATUSES]),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(
      "Chat is enabled only after a patient books a session with the doctor.",
    );
  }
}

async function getOrCreateDoctorPatientRoom(
  doctorUserId: string,
  patientUserId: string,
) {
  await ensureBookedAppointmentPair(doctorUserId, patientUserId);

  const [existingRoom] = await db
    .select({ id: chatRooms.id })
    .from(chatRooms)
    .where(
      and(
        eq(chatRooms.doctorUserId, doctorUserId),
        eq(chatRooms.patientUserId, patientUserId),
        eq(chatRooms.type, "PATIENT_DOCTOR"),
      ),
    )
    .limit(1);

  if (existingRoom) return existingRoom.id;

  const roomId = crypto.randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(chatRooms).values({
      id: roomId,
      doctorUserId,
      type: "PATIENT_DOCTOR",
      patientUserId,
      createdAt: now,
      lastMessageAt: null,
    });
    await tx.insert(chatParticipants).values([
      {
        id: crypto.randomUUID(),
        roomId,
        userId: doctorUserId,
        role: "DOCTOR",
        joinedAt: now,
      },
      {
        id: crypto.randomUUID(),
        roomId,
        userId: patientUserId,
        role: "PATIENT",
        joinedAt: now,
      },
    ]);
  });

  return roomId;
}

async function getOrCreateAppointmentSessionRoom(
  appointmentId: string,
  doctorUserId: string,
  patientUserId: string,
) {
  const [existingRoom] = await db
    .select({
      id: chatRooms.id,
      doctorUserId: chatRooms.doctorUserId,
      patientUserId: chatRooms.patientUserId,
      type: chatRooms.type,
    })
    .from(chatRooms)
    .where(eq(chatRooms.id, appointmentId))
    .limit(1);

  if (existingRoom) {
    if (
      existingRoom.type !== SESSION_ROOM_TYPE ||
      existingRoom.doctorUserId !== doctorUserId ||
      existingRoom.patientUserId !== patientUserId
    ) {
      throw new Error("Invalid existing session room.");
    }
    return existingRoom.id;
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(chatRooms).values({
      id: appointmentId,
      doctorUserId,
      type: SESSION_ROOM_TYPE,
      patientUserId,
      createdAt: now,
      lastMessageAt: null,
    });

    await tx.insert(chatParticipants).values([
      {
        id: crypto.randomUUID(),
        roomId: appointmentId,
        userId: doctorUserId,
        role: "DOCTOR",
        joinedAt: now,
      },
      {
        id: crypto.randomUUID(),
        roomId: appointmentId,
        userId: patientUserId,
        role: "PATIENT",
        joinedAt: now,
      },
    ]);
  });

  return appointmentId;
}

async function syncDoctorRoomsFromBookedAppointments(doctorUserId: string) {
  const bookedPatients = await db
    .select({
      patientUserId: appointments.patientUserId,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorUserId, doctorUserId),
        inArray(appointments.status, [...CHAT_ELIGIBLE_APPOINTMENT_STATUSES]),
      ),
    )
    .groupBy(appointments.patientUserId);

  for (const row of bookedPatients) {
    await getOrCreateDoctorPatientRoom(doctorUserId, row.patientUserId);
  }
}

export async function getActiveUserKeyMeta(userId: string) {
  const [row] = await db
    .select({
      userId: userKeys.userId,
      keyVersion: userKeys.keyVersion,
      signature: user.signature,
    })
    .from(userKeys)
    .innerJoin(user, eq(userKeys.userId, user.id))
    .where(and(eq(userKeys.userId, userId), eq(userKeys.isActive, true)))
    .orderBy(desc(userKeys.keyVersion))
    .limit(1);
  if (!row) throw new Error("No active key material for one of the users.");
  return row;
}

async function getLatestUserKeyring(documentId: string, userId: string) {
  const [row] = await db
    .select({
      wrappedDek: documentKeyrings.wrappedDek,
      userKeyVersion: documentKeyrings.userKeyVersion,
    })
    .from(documentKeyrings)
    .where(
      and(
        eq(documentKeyrings.documentId, documentId),
        eq(documentKeyrings.userId, userId),
      ),
    )
    .orderBy(desc(documentKeyrings.userKeyVersion))
    .limit(1);

  return row ?? null;
}

function deriveWrapKey(input: {
  userId: string;
  keyVersion: number;
  signature: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      `${REPORT_WRAP_SECRET}:${input.userId}:${input.keyVersion}:${input.signature}`,
    )
    .digest();
}

function wrapDek(
  input: { userId: string; keyVersion: number; signature: string },
  dek: Buffer,
) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveWrapKey(input), iv);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  });
}

function unwrapDek(
  input: { userId: string; keyVersion: number; signature: string },
  wrappedDek: string,
) {
  const payload = JSON.parse(wrappedDek) as {
    iv: string;
    tag: string;
    ciphertext: string;
  };
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveWrapKey(input),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
}

async function persistEncryptedFile(documentId: string, encryptedBytes: Buffer) {
  const relativeDir = path.join("storage", "encrypted-reports");
  const absoluteDir = path.join(process.cwd(), relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  const fileName = `${documentId}.bin`;
  const absolutePath = path.join(absoluteDir, fileName);
  await writeFile(absolutePath, encryptedBytes);
  return path.join(relativeDir, fileName).replaceAll("\\", "/");
}

function resolveStoragePath(storageKey: string) {
  const normalized = storageKey.replaceAll("\\", "/");
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.join(process.cwd(), normalized);
}

async function readEncryptedFile(storageKey: string) {
  return readFile(resolveStoragePath(storageKey));
}

async function writeEncryptedFile(storageKey: string, bytes: Buffer) {
  await writeFile(resolveStoragePath(storageKey), bytes);
}

function decryptFileWithDek(input: {
  encryptedBytes: Buffer;
  dek: Buffer;
  ivBase64: string;
  tagBase64: string;
}) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    input.dek,
    Buffer.from(input.ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(input.encryptedBytes),
    decipher.final(),
  ]);
}

function encryptFileWithDek(plainBytes: Buffer, dek: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const encrypted = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted,
    ivBase64: iv.toString("base64"),
    tagBase64: tag.toString("base64"),
  };
}

export async function getDoctorWorkspaceData(
  currentUser: AuthenticatedUser,
  selectedRoomId?: string | null,
): Promise<DoctorWorkspaceData> {
  await maybeFlushBufferedChatMessages();
  const doctorUserId = await requireDoctor(currentUser);
  await syncDoctorRoomsFromBookedAppointments(doctorUserId);
  const now = new Date();
  const todayStart = startOfDay(now);
  const maxDate = addMinutes(now, 60 * 24 * CALENDAR_SLOT_WINDOW_DAYS);

  const [patients, staffMembers, ruleRows, exceptionRows, slots, appts, rooms, reports, outgoing, incoming, doctors, counts] =
    await Promise.all([
      db
        .select({
          userId: doctorPatients.patientUserId,
          name: user.name,
          email: user.email,
          status: doctorPatients.status,
        })
        .from(doctorPatients)
        .innerJoin(user, eq(doctorPatients.patientUserId, user.id))
        .where(eq(doctorPatients.doctorUserId, doctorUserId))
        .orderBy(asc(user.name)),
      db
        .select({
          userId: doctorStaff.staffUserId,
          name: user.name,
          email: user.email,
          staffRole: doctorStaff.staffRole,
          isActive: doctorStaff.isActive,
        })
        .from(doctorStaff)
        .innerJoin(user, eq(doctorStaff.staffUserId, user.id))
        .where(eq(doctorStaff.doctorUserId, doctorUserId))
        .orderBy(asc(user.name)),
      db
        .select({
          id: scheduleRules.id,
          dayOfWeek: scheduleRules.dayOfWeek,
          startTime: scheduleRules.startTime,
          endTime: scheduleRules.endTime,
        })
        .from(scheduleRules)
        .where(eq(scheduleRules.doctorUserId, doctorUserId))
        .orderBy(asc(scheduleRules.dayOfWeek), asc(scheduleRules.startTime)),
      db
        .select({
          id: scheduleExceptions.id,
          date: scheduleExceptions.date,
          type: scheduleExceptions.type,
          startTime: scheduleExceptions.startTime,
          endTime: scheduleExceptions.endTime,
          reason: scheduleExceptions.reason,
        })
        .from(scheduleExceptions)
        .where(
          and(
            eq(scheduleExceptions.doctorUserId, doctorUserId),
            gte(scheduleExceptions.date, todayStart),
          ),
        )
        .orderBy(desc(scheduleExceptions.date))
        .limit(30),
      db
        .select({
          id: appointmentSlots.id,
          startsAt: appointmentSlots.startsAt,
          endsAt: appointmentSlots.endsAt,
          status: appointmentSlots.status,
        })
        .from(appointmentSlots)
        .where(
          and(
            eq(appointmentSlots.doctorUserId, doctorUserId),
            gte(appointmentSlots.startsAt, now),
            lte(appointmentSlots.startsAt, maxDate),
          ),
        )
        .orderBy(asc(appointmentSlots.startsAt))
        .limit(CALENDAR_SLOT_FETCH_LIMIT),
      db
        .select({
          id: appointments.id,
          patientUserId: appointments.patientUserId,
          patientName: user.name,
          status: appointments.status,
          cancelReason: appointments.cancelReason,
          startsAt: appointmentSlots.startsAt,
          endsAt: appointmentSlots.endsAt,
        })
        .from(appointments)
        .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
        .innerJoin(user, eq(appointments.patientUserId, user.id))
        .where(
          and(
            eq(appointments.doctorUserId, doctorUserId),
            ne(appointments.status, "CANCELLED"),
          ),
        )
        .orderBy(desc(appointmentSlots.startsAt))
        .limit(60),
      db
        .select({
          id: chatRooms.id,
          patientUserId: chatRooms.patientUserId,
          type: chatRooms.type,
          lastMessageAt: chatRooms.lastMessageAt,
        })
        .from(chatRooms)
        .where(eq(chatRooms.doctorUserId, doctorUserId))
        .orderBy(desc(chatRooms.lastMessageAt))
        .limit(30),
      db
        .select({
          id: documents.id,
          title: documents.title,
          patientUserId: documents.patientUserId,
          patientName: user.name,
          originalFileName: documents.originalFileName,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .innerJoin(user, eq(documents.patientUserId, user.id))
        .where(eq(documents.ownerDoctorUserId, doctorUserId))
        .orderBy(desc(documents.createdAt))
        .limit(60),
      db
        .select({
          id: documentShares.id,
          documentId: documentShares.documentId,
          documentTitle: documents.title,
          toDoctorUserId: documentShares.toDoctorUserId,
          toDoctorName: user.name,
          status: documentShares.status,
          createdAt: documentShares.createdAt,
        })
        .from(documentShares)
        .innerJoin(documents, eq(documentShares.documentId, documents.id))
        .innerJoin(user, eq(documentShares.toDoctorUserId, user.id))
        .where(eq(documentShares.fromDoctorUserId, doctorUserId))
        .orderBy(desc(documentShares.createdAt))
        .limit(30),
      db
        .select({
          id: documentShares.id,
          documentId: documentShares.documentId,
          documentTitle: documents.title,
          fromDoctorUserId: documentShares.fromDoctorUserId,
          fromDoctorName: user.name,
          status: documentShares.status,
          createdAt: documentShares.createdAt,
        })
        .from(documentShares)
        .innerJoin(documents, eq(documentShares.documentId, documents.id))
        .innerJoin(user, eq(documentShares.fromDoctorUserId, user.id))
        .where(
          and(
            eq(documentShares.toDoctorUserId, doctorUserId),
            eq(documentShares.status, "PENDING"),
          ),
        )
        .orderBy(desc(documentShares.createdAt))
        .limit(30),
      db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(and(eq(user.role, "DOCTOR"), ne(user.id, doctorUserId)))
        .orderBy(asc(user.name)),
      Promise.all([
        db
          .select({ value: sql<number>`count(*)` })
          .from(doctorPatients)
          .where(
            and(
              eq(doctorPatients.doctorUserId, doctorUserId),
              inArray(doctorPatients.status, [...ACTIVE_PATIENT_LINK_STATUSES]),
            ),
          ),
        db
          .select({ value: sql<number>`count(*)` })
          .from(appointmentSlots)
          .where(
            and(
              eq(appointmentSlots.doctorUserId, doctorUserId),
              inArray(appointmentSlots.status, ["OPEN", "HELD"]),
            ),
          ),
        db
          .select({ value: sql<number>`count(*)` })
          .from(appointments)
          .where(
            and(
              eq(appointments.doctorUserId, doctorUserId),
              inArray(appointments.status, ["BOOKED", "CONFIRMED"]),
            ),
          ),
        db
          .select({ value: sql<number>`count(*)` })
          .from(documents)
          .where(eq(documents.ownerDoctorUserId, doctorUserId)),
        db
          .select({ value: sql<number>`count(*)` })
          .from(documentShares)
          .where(
            and(
              eq(documentShares.toDoctorUserId, doctorUserId),
              eq(documentShares.status, "PENDING"),
            ),
          ),
      ]),
    ]);

  const chatEligiblePatientIds = new Set(
    appts
      .filter((item) =>
        CHAT_ELIGIBLE_APPOINTMENT_STATUSES.includes(
          item.status as (typeof CHAT_ELIGIBLE_APPOINTMENT_STATUSES)[number],
        ),
      )
      .map((item) => item.patientUserId),
  );

  const scopedRooms = rooms.filter(
    (room) =>
      room.patientUserId !== null && chatEligiblePatientIds.has(room.patientUserId),
  );

  const roomIds = scopedRooms.map((room) => room.id);
  const roomPatientIds = scopedRooms
    .map((room) => room.patientUserId)
    .filter((value): value is string => Boolean(value));

  const [roomMessages, roomPatients, bufferedByRoom] = await Promise.all([
    roomIds.length > 0
      ? db
          .select({
            roomId: chatMessages.roomId,
            text: chatMessages.text,
            createdAt: chatMessages.createdAt,
          })
          .from(chatMessages)
          .where(inArray(chatMessages.roomId, roomIds))
          .orderBy(desc(chatMessages.createdAt))
      : Promise.resolve([]),
    roomPatientIds.length > 0
      ? db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, roomPatientIds))
      : Promise.resolve([]),
    getBufferedChatMessagesByRoomIds(roomIds),
  ]);

  const latestMessageByRoomId = new Map<
    string,
    { text: string; createdAt: number }
  >();
  for (const row of roomMessages) {
    if (latestMessageByRoomId.has(row.roomId)) continue;
    latestMessageByRoomId.set(row.roomId, {
      text: row.text,
      createdAt: row.createdAt.getTime(),
    });
  }

  for (const [roomId, bufferedMessages] of bufferedByRoom.entries()) {
    const latestBuffered = bufferedMessages[bufferedMessages.length - 1];
    if (!latestBuffered) continue;
    const latestBufferedAt = latestBuffered.createdAt.getTime();
    const existing = latestMessageByRoomId.get(roomId);
    if (!existing || latestBufferedAt > existing.createdAt) {
      latestMessageByRoomId.set(roomId, {
        text: latestBuffered.text,
        createdAt: latestBufferedAt,
      });
    }
  }

  const roomPatientNameById = new Map(
    roomPatients.map((item) => [item.id, item.name]),
  );
  const hasSelectedRoom =
    typeof selectedRoomId === "string" &&
    scopedRooms.some((room) => room.id === selectedRoomId);
  const activeRoomId = hasSelectedRoom
    ? selectedRoomId
    : (scopedRooms[0]?.id ?? null);

  const selectedRoomMessagesPersisted =
    activeRoomId !== null
      ? await db
          .select({
            id: chatMessages.id,
            senderUserId: chatMessages.senderUserId,
            senderName: user.name,
            text: chatMessages.text,
            createdAt: chatMessages.createdAt,
          })
          .from(chatMessages)
          .innerJoin(user, eq(chatMessages.senderUserId, user.id))
          .where(eq(chatMessages.roomId, activeRoomId))
          .orderBy(asc(chatMessages.createdAt))
          .limit(80)
      : [];

  const selectedRoomBuffered =
    activeRoomId !== null
      ? (bufferedByRoom.get(activeRoomId) ?? []).map((item) =>
          toSessionMessageFromBuffered({
            id: item.id,
            senderUserId: item.senderUserId,
            senderName: item.senderName,
            text: item.text,
            createdAt: item.createdAt,
          }),
        )
      : [];
  const selectedRoomMessages = mergeSessionMessages(
    selectedRoomMessagesPersisted,
    selectedRoomBuffered,
  );

  const [patientsCountRow] = counts[0];
  const [openSlotsCountRow] = counts[1];
  const [appointmentsCountRow] = counts[2];
  const [reportsCountRow] = counts[3];
  const [pendingSharesCountRow] = counts[4];

  return {
    counts: {
      patients: Number(patientsCountRow?.value ?? 0),
      openSlots: Number(openSlotsCountRow?.value ?? 0),
      appointments: Number(appointmentsCountRow?.value ?? 0),
      reports: Number(reportsCountRow?.value ?? 0),
      pendingShares: Number(pendingSharesCountRow?.value ?? 0),
    },
    patients,
    staffMembers,
    scheduleRules: ruleRows,
    scheduleExceptions: exceptionRows.map((item) => ({
      id: item.id,
      date: dateOnly(item.date),
      type: item.type,
      startTime: item.startTime,
      endTime: item.endTime,
      reason: item.reason,
    })),
    upcomingSlots: slots,
    appointments: appts,
    chatRooms: scopedRooms.map((room) => ({
      id: room.id,
      patientUserId: room.patientUserId,
      patientName: room.patientUserId
        ? roomPatientNameById.get(room.patientUserId) ?? "Unknown patient"
        : "No patient",
      type: room.type,
      lastMessageAt: room.lastMessageAt,
      latestMessage: latestMessageByRoomId.get(room.id)?.text ?? null,
    })),
    selectedRoomMessages,
    selectedRoomId: activeRoomId,
    reports,
    outgoingShares: outgoing,
    incomingShares: incoming,
    doctorOptions: doctors,
  };
}

export async function createScheduleRule(
  currentUser: AuthenticatedUser,
  input: { dayOfWeek: number; startTime: string; endTime: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    throw new Error("Day of week must be between 0 and 6.");
  }
  if (parseTimeToMinutes(input.startTime) >= parseTimeToMinutes(input.endTime)) {
    throw new Error("End time must be after start time.");
  }

  await db.insert(scheduleRules).values({
    id: crypto.randomUUID(),
    doctorUserId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
  });
}

export async function applyNepalDefaultWeeklySchedule(
  currentUser: AuthenticatedUser,
  input: { startTime: string; endTime: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  if (parseTimeToMinutes(input.startTime) >= parseTimeToMinutes(input.endTime)) {
    throw new Error("End time must be after start time.");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(scheduleRules)
      .where(eq(scheduleRules.doctorUserId, doctorUserId));

    await tx.insert(scheduleRules).values(
      [0, 1, 2, 3, 4, 5].map((dayOfWeek) => ({
        id: crypto.randomUUID(),
        doctorUserId,
        dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
      })),
    );

    // Keep the simplified flow consistent: 60 min sessions with no buffer gap.
    await tx
      .update(doctorProfile)
      .set({
        defaultSessionMinutes: 60,
        bufferMinutes: 0,
      })
      .where(eq(doctorProfile.userId, doctorUserId));
  });
}

export async function deleteScheduleRule(
  currentUser: AuthenticatedUser,
  scheduleRuleId: string,
) {
  const doctorUserId = await requireDoctor(currentUser);
  const [rule] = await db
    .select({
      id: scheduleRules.id,
      doctorUserId: scheduleRules.doctorUserId,
    })
    .from(scheduleRules)
    .where(eq(scheduleRules.id, scheduleRuleId))
    .limit(1);

  if (!rule || rule.doctorUserId !== doctorUserId) {
    throw new Error("Schedule rule not found.");
  }
  await db.delete(scheduleRules).where(eq(scheduleRules.id, scheduleRuleId));
}

export async function createScheduleException(
  currentUser: AuthenticatedUser,
  input: {
    date: string;
    type: "OFF" | "CUSTOM_HOURS";
    startTime?: string;
    endTime?: string;
    reason?: string;
  },
) {
  const doctorUserId = await requireDoctor(currentUser);
  if (!input.date) throw new Error("Date is required.");
  const parsedDate = new Date(`${input.date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid exception date.");
  }
  if (input.type === "CUSTOM_HOURS") {
    if (!input.startTime || !input.endTime) {
      throw new Error("Custom hours require start and end time.");
    }
    if (parseTimeToMinutes(input.startTime) >= parseTimeToMinutes(input.endTime)) {
      throw new Error("Custom hour end must be after start.");
    }
  }

  await db.insert(scheduleExceptions).values({
    id: crypto.randomUUID(),
    doctorUserId,
    date: parsedDate,
    type: input.type,
    startTime: input.type === "CUSTOM_HOURS" ? input.startTime ?? null : null,
    endTime: input.type === "CUSTOM_HOURS" ? input.endTime ?? null : null,
    reason: input.reason?.trim() || null,
  });
}

export async function deleteScheduleException(
  currentUser: AuthenticatedUser,
  scheduleExceptionId: string,
) {
  const doctorUserId = await requireDoctor(currentUser);
  const [exception] = await db
    .select({
      id: scheduleExceptions.id,
      doctorUserId: scheduleExceptions.doctorUserId,
    })
    .from(scheduleExceptions)
    .where(eq(scheduleExceptions.id, scheduleExceptionId))
    .limit(1);

  if (!exception || exception.doctorUserId !== doctorUserId) {
    throw new Error("Schedule exception not found.");
  }

  await db
    .delete(scheduleExceptions)
    .where(eq(scheduleExceptions.id, scheduleExceptionId));
}

export async function markDoctorHolidayByDate(
  currentUser: AuthenticatedUser,
  input: { date: string; reason?: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  if (!input.date) throw new Error("Date is required.");

  const parsedDate = new Date(`${input.date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid holiday date.");
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsedDate < today) {
    throw new Error("Past dates cannot be changed.");
  }

  const [existing] = await db
    .select({
      id: scheduleExceptions.id,
    })
    .from(scheduleExceptions)
    .where(
      and(
        eq(scheduleExceptions.doctorUserId, doctorUserId),
        eq(scheduleExceptions.date, parsedDate),
        eq(scheduleExceptions.type, "OFF"),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(scheduleExceptions)
      .set({
        reason: input.reason?.trim() || null,
      })
      .where(eq(scheduleExceptions.id, existing.id));
    return;
  }

  await db.insert(scheduleExceptions).values({
    id: crypto.randomUUID(),
    doctorUserId,
    date: parsedDate,
    type: "OFF",
    startTime: null,
    endTime: null,
    reason: input.reason?.trim() || null,
  });
}

export async function clearDoctorHolidayByDate(
  currentUser: AuthenticatedUser,
  input: { date: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  if (!input.date) throw new Error("Date is required.");

  const parsedDate = new Date(`${input.date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid holiday date.");
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsedDate < today) {
    throw new Error("Past dates cannot be changed.");
  }

  await db
    .delete(scheduleExceptions)
    .where(
      and(
        eq(scheduleExceptions.doctorUserId, doctorUserId),
        eq(scheduleExceptions.date, parsedDate),
        eq(scheduleExceptions.type, "OFF"),
      ),
    );
}

export async function setDoctorSlotStatus(
  currentUser: AuthenticatedUser,
  input: { slotId: string; status: "OPEN" | "HELD" | "BLOCKED" },
) {
  const doctorUserId = await requireDoctor(currentUser);

  const [slot] = await db
    .select({
      id: appointmentSlots.id,
      doctorUserId: appointmentSlots.doctorUserId,
      status: appointmentSlots.status,
      startsAt: appointmentSlots.startsAt,
    })
    .from(appointmentSlots)
    .where(eq(appointmentSlots.id, input.slotId))
    .limit(1);

  if (!slot || slot.doctorUserId !== doctorUserId) {
    throw new Error("Slot not found in this doctor tenant.");
  }
  if (slot.status === "BOOKED") {
    throw new Error("Booked slots cannot be changed.");
  }
  if (slot.startsAt < new Date()) {
    throw new Error("Past slots cannot be changed.");
  }

  await db
    .update(appointmentSlots)
    .set({
      status: input.status,
      holdToken: input.status === "HELD" ? (slot.id || crypto.randomUUID()) : null,
      holdExpiresAt:
        input.status === "HELD"
          ? new Date(Date.now() + 1000 * 60 * 30)
          : null,
    })
    .where(eq(appointmentSlots.id, input.slotId));
}

export async function deleteDoctorSlot(
  currentUser: AuthenticatedUser,
  input: { slotId: string },
) {
  const doctorUserId = await requireDoctor(currentUser);

  const [slot] = await db
    .select({
      id: appointmentSlots.id,
      doctorUserId: appointmentSlots.doctorUserId,
      status: appointmentSlots.status,
      startsAt: appointmentSlots.startsAt,
    })
    .from(appointmentSlots)
    .where(eq(appointmentSlots.id, input.slotId))
    .limit(1);

  if (!slot || slot.doctorUserId !== doctorUserId) {
    throw new Error("Slot not found in this doctor tenant.");
  }
  if (slot.status === "BOOKED") {
    throw new Error("Booked slots cannot be removed.");
  }
  if (slot.startsAt < new Date()) {
    throw new Error("Past slots cannot be removed.");
  }

  const [appointmentHistory] = await db
    .select({
      id: appointments.id,
    })
    .from(appointments)
    .where(eq(appointments.slotId, input.slotId))
    .limit(1);

  if (appointmentHistory) {
    throw new Error("Slot cannot be removed because it has appointment history.");
  }

  await db.delete(appointmentSlots).where(eq(appointmentSlots.id, input.slotId));
}

export async function createManualSlot(
  currentUser: AuthenticatedUser,
  input: { startsAt: Date; endsAt: Date },
) {
  const doctorUserId = await requireDoctor(currentUser);
  if (input.startsAt >= input.endsAt) {
    throw new Error("Slot end must be after slot start.");
  }

  await db
    .insert(appointmentSlots)
    .values({
      id: crypto.randomUUID(),
      doctorUserId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: "OPEN",
      createdAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        id: sql`${appointmentSlots.id}`,
      },
    });
}

export async function generateSlotsFromRules(
  currentUser: AuthenticatedUser,
  input: { startDate: string; endDate: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const startDate = new Date(`${input.startDate}T00:00:00`);
  const endDate = new Date(`${input.endDate}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid start or end date.");
  }
  if (startDate > endDate) throw new Error("Start date must be before end date.");

  const rangeDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) +
    1;
  if (rangeDays > 90) throw new Error("Generate slots in batches up to 90 days.");

  const [profile, rules, exceptions] = await Promise.all([
    db
      .select({
        defaultSessionMinutes: doctorProfile.defaultSessionMinutes,
        bufferMinutes: doctorProfile.bufferMinutes,
      })
      .from(doctorProfile)
      .where(eq(doctorProfile.userId, doctorUserId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        dayOfWeek: scheduleRules.dayOfWeek,
        startTime: scheduleRules.startTime,
        endTime: scheduleRules.endTime,
      })
      .from(scheduleRules)
      .where(eq(scheduleRules.doctorUserId, doctorUserId)),
    db
      .select({
        date: scheduleExceptions.date,
        type: scheduleExceptions.type,
        startTime: scheduleExceptions.startTime,
        endTime: scheduleExceptions.endTime,
      })
      .from(scheduleExceptions)
      .where(
        and(
          eq(scheduleExceptions.doctorUserId, doctorUserId),
          gte(scheduleExceptions.date, startDate),
          lte(scheduleExceptions.date, endDate),
        ),
      ),
  ]);

  const sessionMinutes = profile?.defaultSessionMinutes ?? 60;
  // Keep slots aligned on predictable boundaries for calendar UX.
  const bufferMinutes = 0;
  const exceptionByDate = new Map(
    exceptions.map((item) => [dateOnly(item.date), item]),
  );

  const values: Array<typeof appointmentSlots.$inferInsert> = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    const dateKey = dateOnly(cursor);
    const exception = exceptionByDate.get(dateKey);
    if (exception?.type === "OFF") {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const dayRules = rules.filter((rule) => rule.dayOfWeek === cursor.getDay());
    for (const rule of dayRules) {
      const startTime =
        exception?.type === "CUSTOM_HOURS" && exception.startTime
          ? exception.startTime
          : rule.startTime;
      const endTime =
        exception?.type === "CUSTOM_HOURS" && exception.endTime
          ? exception.endTime
          : rule.endTime;

      let slotStart = withTime(cursor, startTime);
      const dayEnd = withTime(cursor, endTime);
      while (addMinutes(slotStart, sessionMinutes) <= dayEnd) {
        const slotEnd = addMinutes(slotStart, sessionMinutes);
        values.push({
          id: crypto.randomUUID(),
          doctorUserId,
          startsAt: slotStart,
          endsAt: slotEnd,
          status: "OPEN",
          createdAt: new Date(),
        });
        slotStart = addMinutes(slotEnd, bufferMinutes);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (values.length === 0) return { attempted: 0 };

  const rangeStart = new Date(startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate);
  rangeEnd.setHours(23, 59, 59, 999);

  // Remove old non-booked slots in the same range so regeneration stays clean.
  await db.delete(appointmentSlots).where(
    and(
      eq(appointmentSlots.doctorUserId, doctorUserId),
      gte(appointmentSlots.startsAt, rangeStart),
      lte(appointmentSlots.startsAt, rangeEnd),
      inArray(appointmentSlots.status, ["OPEN", "HELD", "BLOCKED"]),
    ),
  );

  await db
    .insert(appointmentSlots)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        id: sql`${appointmentSlots.id}`,
      },
    });

  return { attempted: values.length };
}

export async function updateAppointmentStatus(
  currentUser: AuthenticatedUser,
  input: {
    appointmentId: string;
    status: "BOOKED" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
    cancelReason?: string;
  },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const record = await getAppointmentForDoctor(doctorUserId, input.appointmentId);

  await db
    .update(appointments)
    .set({
      status: input.status,
      cancelledAt: input.status === "CANCELLED" ? new Date() : null,
      cancelReason:
        input.status === "CANCELLED"
          ? (input.cancelReason?.trim() || null)
          : null,
    })
    .where(eq(appointments.id, input.appointmentId));

  if (input.status === "CONFIRMED") {
    await sendMailSafely("send appointment confirmed email to patient", () =>
      sendAppointmentConfirmedEmailToPatient({
        appointmentId: record.id,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        doctorName: currentUser.name,
        patientName: record.patientName,
        patientEmail: record.patientEmail,
      }),
    );
  }
}

export async function getDoctorBookingsList(
  currentUser: AuthenticatedUser,
  filter: DoctorBookingsFilter = {},
): Promise<DoctorBookingListRow[]> {
  const doctorUserId = await requireDoctor(currentUser);
  const range = resolveDoctorBookingsRange(filter);
  const patientQuery = filter.patientQuery?.trim();
  const whereClauses = [eq(appointments.doctorUserId, doctorUserId)];

  // Keep the default list focused on actionable sessions.
  // Past sessions are shown only when the doctor explicitly searches a patient.
  if (!patientQuery) {
    whereClauses.push(gte(appointmentSlots.endsAt, new Date()));
  }

  if (range) {
    whereClauses.push(gte(appointmentSlots.startsAt, range.start));
    whereClauses.push(lte(appointmentSlots.startsAt, range.end));
  }

  if (
    filter.status &&
    filter.status !== "ALL" &&
    (filter.status === "BOOKED" ||
      filter.status === "CONFIRMED" ||
      filter.status === "COMPLETED" ||
      filter.status === "CANCELLED")
  ) {
    whereClauses.push(eq(appointments.status, filter.status));
  }

  if (patientQuery) {
    whereClauses.push(
      or(
        like(user.name, `%${patientQuery}%`),
        like(user.email, `%${patientQuery}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: appointments.id,
      patientUserId: appointments.patientUserId,
      patientName: user.name,
      patientEmail: user.email,
      status: appointments.status,
      cancelReason: appointments.cancelReason,
      startsAt: appointmentSlots.startsAt,
      endsAt: appointmentSlots.endsAt,
    })
    .from(appointments)
    .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
    .innerJoin(user, eq(appointments.patientUserId, user.id))
    .where(and(...whereClauses))
    .orderBy(desc(appointmentSlots.startsAt))
    .limit(400);

  return rows.map((row) => ({
    ...row,
    status: normalizeBookingStatus(row.status),
  }));
}

type SessionAppointmentRow = {
  id: string;
  doctorUserId: string;
  patientUserId: string;
  status: AppointmentStatus;
  cancelReason: string | null;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
};

async function getAppointmentForDoctor(
  doctorUserId: string,
  appointmentId: string,
): Promise<
  SessionAppointmentRow & {
    patientName: string;
    patientEmail: string;
    patientPhone: string | null;
  }
> {
  const [row] = await db
    .select({
      id: appointments.id,
      doctorUserId: appointments.doctorUserId,
      patientUserId: appointments.patientUserId,
      status: appointments.status,
      cancelReason: appointments.cancelReason,
      startsAt: appointmentSlots.startsAt,
      endsAt: appointmentSlots.endsAt,
      createdAt: appointments.createdAt,
      patientName: user.name,
      patientEmail: user.email,
      patientPhone: user.phone,
    })
    .from(appointments)
    .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
    .innerJoin(user, eq(appointments.patientUserId, user.id))
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!row || row.doctorUserId !== doctorUserId) {
    throw new Error("Session not found in this doctor tenant.");
  }

  return {
    ...row,
    status: normalizeBookingStatus(row.status),
  };
}

async function getAppointmentForPatient(
  patientUserId: string,
  appointmentId: string,
): Promise<
  SessionAppointmentRow & {
    doctorName: string;
    doctorEmail: string;
    doctorPhone: string | null;
  }
> {
  const [row] = await db
    .select({
      id: appointments.id,
      doctorUserId: appointments.doctorUserId,
      patientUserId: appointments.patientUserId,
      status: appointments.status,
      cancelReason: appointments.cancelReason,
      startsAt: appointmentSlots.startsAt,
      endsAt: appointmentSlots.endsAt,
      createdAt: appointments.createdAt,
      doctorName: user.name,
      doctorEmail: user.email,
      doctorPhone: user.phone,
    })
    .from(appointments)
    .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
    .innerJoin(user, eq(appointments.doctorUserId, user.id))
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!row || row.patientUserId !== patientUserId) {
    throw new Error("Session not found for this patient.");
  }

  return {
    ...row,
    status: normalizeBookingStatus(row.status),
  };
}

async function getSessionMessages(roomId: string): Promise<SessionChatMessage[]> {
  const persisted = await db
    .select({
      id: chatMessages.id,
      senderUserId: chatMessages.senderUserId,
      senderName: user.name,
      text: chatMessages.text,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .innerJoin(user, eq(chatMessages.senderUserId, user.id))
    .where(eq(chatMessages.roomId, roomId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(300);

  const bufferedRaw = await getBufferedChatMessagesForRoom(roomId);
  const buffered = bufferedRaw.map((item) =>
    toSessionMessageFromBuffered({
      id: item.id,
      senderUserId: item.senderUserId,
      senderName: item.senderName,
      text: item.text,
      createdAt: item.createdAt,
    }),
  );

  return mergeSessionMessages(persisted, buffered);
}

async function getFallbackBookingMessage(
  doctorUserId: string,
  patientUserId: string,
  startsAt: Date,
) {
  const [legacyRoom] = await db
    .select({ id: chatRooms.id })
    .from(chatRooms)
    .where(
      and(
        eq(chatRooms.doctorUserId, doctorUserId),
        eq(chatRooms.patientUserId, patientUserId),
        eq(chatRooms.type, "PATIENT_DOCTOR"),
      ),
    )
    .limit(1);

  if (!legacyRoom) return null;

  const [legacyMessage] = await db
    .select({ text: chatMessages.text })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.roomId, legacyRoom.id),
        eq(chatMessages.senderUserId, patientUserId),
        lte(chatMessages.createdAt, startsAt),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);

  return legacyMessage?.text ?? null;
}

async function resolveBookingMessage(
  messages: SessionChatMessage[],
  appointment: SessionAppointmentRow,
) {
  const fromPatient = messages.find(
    (message) => message.senderUserId === appointment.patientUserId,
  )?.text;
  if (fromPatient) return fromPatient;

  return getFallbackBookingMessage(
    appointment.doctorUserId,
    appointment.patientUserId,
    appointment.startsAt,
  );
}

export type DoctorSessionWorkspaceData = {
  appointment: {
    id: string;
    status: AppointmentStatus;
    cancelReason: string | null;
    startsAt: Date;
    endsAt: Date;
  };
  patient: {
    userId: string;
    name: string;
    email: string;
    phone: string | null;
  };
  bookingMessage: string | null;
  messages: SessionChatMessage[];
  reports: SessionReportRow[];
};

export async function getDoctorSessionWorkspaceData(
  currentUser: AuthenticatedUser,
  appointmentId: string,
): Promise<DoctorSessionWorkspaceData> {
  await maybeFlushBufferedChatMessages();
  const doctorUserId = await requireDoctor(currentUser);
  const appointment = await getAppointmentForDoctor(doctorUserId, appointmentId);
  const roomId = await getOrCreateAppointmentSessionRoom(
    appointment.id,
    appointment.doctorUserId,
    appointment.patientUserId,
  );

  const [messages, reports] = await Promise.all([
    getSessionMessages(roomId),
    db
      .select({
        id: documents.id,
        title: documents.title,
        originalFileName: documents.originalFileName,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(
        and(
          eq(documents.ownerDoctorUserId, doctorUserId),
          eq(documents.appointmentId, appointment.id),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(120),
  ]);

  return {
    appointment: {
      id: appointment.id,
      status: normalizeBookingStatus(appointment.status),
      cancelReason: appointment.cancelReason,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    },
    patient: {
      userId: appointment.patientUserId,
      name: appointment.patientName,
      email: appointment.patientEmail,
      phone: appointment.patientPhone,
    },
    bookingMessage: await resolveBookingMessage(messages, appointment),
    messages,
    reports,
  };
}

export type PatientSessionWorkspaceData = {
  appointment: {
    id: string;
    status: AppointmentStatus;
    cancelReason: string | null;
    startsAt: Date;
    endsAt: Date;
  };
  doctor: {
    userId: string;
    name: string;
    email: string;
    phone: string | null;
  };
  bookingMessage: string | null;
  messages: SessionChatMessage[];
  reports: SessionReportRow[];
};

export async function getPatientSessionWorkspaceData(
  currentUser: AuthenticatedUser,
  appointmentId: string,
): Promise<PatientSessionWorkspaceData> {
  await maybeFlushBufferedChatMessages();
  const patientUserId = await requirePatient(currentUser);
  const appointment = await getAppointmentForPatient(patientUserId, appointmentId);
  const roomId = await getOrCreateAppointmentSessionRoom(
    appointment.id,
    appointment.doctorUserId,
    appointment.patientUserId,
  );

  const [messages, reports] = await Promise.all([
    getSessionMessages(roomId),
    db
      .select({
        id: documents.id,
        title: documents.title,
        originalFileName: documents.originalFileName,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .innerJoin(
        documentAccess,
        and(
          eq(documentAccess.documentId, documents.id),
          eq(documentAccess.userId, patientUserId),
          eq(documentAccess.canRead, true),
        ),
      )
      .where(eq(documents.appointmentId, appointment.id))
      .orderBy(desc(documents.createdAt))
      .limit(120),
  ]);

  return {
    appointment: {
      id: appointment.id,
      status: normalizeBookingStatus(appointment.status),
      cancelReason: appointment.cancelReason,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    },
    doctor: {
      userId: appointment.doctorUserId,
      name: appointment.doctorName,
      email: appointment.doctorEmail,
      phone: appointment.doctorPhone,
    },
    bookingMessage: await resolveBookingMessage(messages, appointment),
    messages,
    reports,
  };
}

export async function sendDoctorSessionMessage(
  currentUser: AuthenticatedUser,
  input: { appointmentId: string; text: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const appointment = await getAppointmentForDoctor(doctorUserId, input.appointmentId);
  const text = input.text.trim();
  if (!text) throw new Error("Message text is required.");

  const roomId = await getOrCreateAppointmentSessionRoom(
    appointment.id,
    appointment.doctorUserId,
    appointment.patientUserId,
  );
  const messageId = crypto.randomUUID();
  const now = new Date();
  const clientTimestamp = Date.now();

  await db
    .update(chatRooms)
    .set({ lastMessageAt: now })
    .where(eq(chatRooms.id, roomId));

  await emitChatRealtimeAndBuffer({
    id: messageId,
    roomId,
    senderUserId: doctorUserId,
    senderName: currentUser.name,
    text,
    createdAt: now,
    clientTimestamp,
  });
}

export async function sendPatientSessionMessage(
  currentUser: AuthenticatedUser,
  input: { appointmentId: string; text: string },
) {
  const patientUserId = await requirePatient(currentUser);
  const appointment = await getAppointmentForPatient(patientUserId, input.appointmentId);
  const text = input.text.trim();
  if (!text) throw new Error("Message text is required.");

  const roomId = await getOrCreateAppointmentSessionRoom(
    appointment.id,
    appointment.doctorUserId,
    appointment.patientUserId,
  );
  const messageId = crypto.randomUUID();
  const now = new Date();
  const clientTimestamp = Date.now();

  await db
    .update(chatRooms)
    .set({ lastMessageAt: now })
    .where(eq(chatRooms.id, roomId));

  await emitChatRealtimeAndBuffer({
    id: messageId,
    roomId,
    senderUserId: patientUserId,
    senderName: currentUser.name,
    text,
    createdAt: now,
    clientTimestamp,
  });
}

export async function uploadSessionReport(
  currentUser: AuthenticatedUser,
  input: {
    appointmentId: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileBuffer: Buffer;
  },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const appointment = await getAppointmentForDoctor(doctorUserId, input.appointmentId);

  return uploadEncryptedReport(currentUser, {
    patientUserId: appointment.patientUserId,
    title: input.title,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileBuffer: input.fileBuffer,
    appointmentId: appointment.id,
  });
}

export async function createDoctorPatientRoom(
  currentUser: AuthenticatedUser,
  input: { patientUserId: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  return getOrCreateDoctorPatientRoom(doctorUserId, input.patientUserId);
}

export async function sendDoctorChatMessage(
  currentUser: AuthenticatedUser,
  input: { roomId: string; text: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const message = input.text.trim();
  if (!message) throw new Error("Message text is required.");

  const [room] = await db
    .select({
      id: chatRooms.id,
      doctorUserId: chatRooms.doctorUserId,
      patientUserId: chatRooms.patientUserId,
      type: chatRooms.type,
    })
    .from(chatRooms)
    .where(eq(chatRooms.id, input.roomId))
    .limit(1);

  if (
    !room ||
    room.doctorUserId !== doctorUserId ||
    room.type !== "PATIENT_DOCTOR" ||
    !room.patientUserId
  ) {
    throw new Error("Chat room not found in this doctor tenant.");
  }

  await ensureBookedAppointmentPair(doctorUserId, room.patientUserId);

  const now = new Date();
  const messageId = crypto.randomUUID();
  const clientTimestamp = Date.now();
  await db
    .update(chatRooms)
    .set({ lastMessageAt: now })
    .where(eq(chatRooms.id, room.id));

  await emitChatRealtimeAndBuffer({
    id: messageId,
    roomId: room.id,
    senderUserId: doctorUserId,
    senderName: currentUser.name,
    text: message,
    createdAt: now,
    clientTimestamp,
  });
}

export type PatientChatWorkspaceData = {
  rooms: Array<{
    id: string;
    doctorUserId: string;
    doctorName: string;
    lastMessageAt: Date | null;
    latestMessage: string | null;
  }>;
  selectedRoomId: string | null;
  selectedRoomMessages: Array<{
    id: string;
    senderUserId: string;
    senderName: string;
    text: string;
    createdAt: Date;
  }>;
};

async function requirePatient(currentUser: AuthenticatedUser) {
  if (currentUser.role !== "PATIENT") {
    throw new Error("Only patients can access this workspace.");
  }
  return currentUser.id;
}

async function syncPatientRoomsFromBookedAppointments(patientUserId: string) {
  const bookedDoctors = await db
    .select({
      doctorUserId: appointments.doctorUserId,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.patientUserId, patientUserId),
        inArray(appointments.status, [...CHAT_ELIGIBLE_APPOINTMENT_STATUSES]),
      ),
    )
    .groupBy(appointments.doctorUserId);

  for (const row of bookedDoctors) {
    await getOrCreateDoctorPatientRoom(row.doctorUserId, patientUserId);
  }
}

export async function getPatientChatWorkspaceData(
  currentUser: AuthenticatedUser,
  selectedRoomId?: string | null,
): Promise<PatientChatWorkspaceData> {
  await maybeFlushBufferedChatMessages();
  const patientUserId = await requirePatient(currentUser);
  await syncPatientRoomsFromBookedAppointments(patientUserId);

  const rooms = await db
    .select({
      id: chatRooms.id,
      doctorUserId: chatRooms.doctorUserId,
      doctorName: user.name,
      lastMessageAt: chatRooms.lastMessageAt,
    })
    .from(chatRooms)
    .innerJoin(user, eq(chatRooms.doctorUserId, user.id))
    .where(
      and(
        eq(chatRooms.patientUserId, patientUserId),
        eq(chatRooms.type, "PATIENT_DOCTOR"),
      ),
    )
    .orderBy(desc(chatRooms.lastMessageAt))
    .limit(40);

  const roomIds = rooms.map((room) => room.id);
  const [messages, bufferedByRoom] = await Promise.all([
    roomIds.length
      ? db
          .select({
            roomId: chatMessages.roomId,
            text: chatMessages.text,
            createdAt: chatMessages.createdAt,
          })
          .from(chatMessages)
          .where(inArray(chatMessages.roomId, roomIds))
          .orderBy(desc(chatMessages.createdAt))
      : Promise.resolve([]),
    getBufferedChatMessagesByRoomIds(roomIds),
  ]);

  const latestMessageByRoomId = new Map<
    string,
    { text: string; createdAt: number }
  >();
  for (const row of messages) {
    if (latestMessageByRoomId.has(row.roomId)) continue;
    latestMessageByRoomId.set(row.roomId, {
      text: row.text,
      createdAt: row.createdAt.getTime(),
    });
  }
  for (const [roomId, bufferedMessages] of bufferedByRoom.entries()) {
    const latestBuffered = bufferedMessages[bufferedMessages.length - 1];
    if (!latestBuffered) continue;
    const latestBufferedAt = latestBuffered.createdAt.getTime();
    const existing = latestMessageByRoomId.get(roomId);
    if (!existing || latestBufferedAt > existing.createdAt) {
      latestMessageByRoomId.set(roomId, {
        text: latestBuffered.text,
        createdAt: latestBufferedAt,
      });
    }
  }

  const hasSelectedRoom =
    typeof selectedRoomId === "string" &&
    rooms.some((room) => room.id === selectedRoomId);
  const activeRoomId = hasSelectedRoom ? selectedRoomId : (rooms[0]?.id ?? null);
  const selectedRoomMessagesPersisted =
    activeRoomId !== null
      ? await db
          .select({
            id: chatMessages.id,
            senderUserId: chatMessages.senderUserId,
            senderName: user.name,
            text: chatMessages.text,
            createdAt: chatMessages.createdAt,
          })
          .from(chatMessages)
          .innerJoin(user, eq(chatMessages.senderUserId, user.id))
          .where(eq(chatMessages.roomId, activeRoomId))
          .orderBy(asc(chatMessages.createdAt))
          .limit(120)
      : [];

  const selectedRoomBuffered =
    activeRoomId !== null
      ? (bufferedByRoom.get(activeRoomId) ?? []).map((item) =>
          toSessionMessageFromBuffered({
            id: item.id,
            senderUserId: item.senderUserId,
            senderName: item.senderName,
            text: item.text,
            createdAt: item.createdAt,
          }),
        )
      : [];
  const selectedRoomMessages = mergeSessionMessages(
    selectedRoomMessagesPersisted,
    selectedRoomBuffered,
  );

  return {
    rooms: rooms.map((room) => ({
      ...room,
      latestMessage: latestMessageByRoomId.get(room.id)?.text ?? null,
    })),
    selectedRoomId: activeRoomId,
    selectedRoomMessages,
  };
}

export async function sendPatientChatMessage(
  currentUser: AuthenticatedUser,
  input: { roomId: string; text: string },
) {
  const patientUserId = await requirePatient(currentUser);
  const text = input.text.trim();
  if (!text) throw new Error("Message text is required.");

  const [room] = await db
    .select({
      id: chatRooms.id,
      doctorUserId: chatRooms.doctorUserId,
      patientUserId: chatRooms.patientUserId,
      type: chatRooms.type,
    })
    .from(chatRooms)
    .where(eq(chatRooms.id, input.roomId))
    .limit(1);

  if (
    !room ||
    room.type !== "PATIENT_DOCTOR" ||
    room.patientUserId !== patientUserId
  ) {
    throw new Error("Chat room not found.");
  }

  await ensureBookedAppointmentPair(room.doctorUserId, patientUserId);

  const now = new Date();
  const messageId = crypto.randomUUID();
  const clientTimestamp = Date.now();
  await db
    .update(chatRooms)
    .set({
      lastMessageAt: now,
    })
    .where(eq(chatRooms.id, room.id));

  await emitChatRealtimeAndBuffer({
    id: messageId,
    roomId: room.id,
    senderUserId: patientUserId,
    senderName: currentUser.name,
    text,
    createdAt: now,
    clientTimestamp,
  });
}

export type PatientScheduleData = {
  doctorLinks: Array<{
    doctorUserId: string;
    doctorName: string;
    status: string;
  }>;
  availableSlots: Array<{
    slotId: string;
    doctorUserId: string;
    doctorName: string;
    startsAt: Date;
    endsAt: Date;
  }>;
  bookedAppointments: Array<{
    appointmentId: string;
    doctorUserId: string;
    doctorName: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
  }>;
};

export async function getPatientScheduleData(
  currentUser: AuthenticatedUser,
): Promise<PatientScheduleData> {
  const patientUserId = await requirePatient(currentUser);
  const now = new Date();
  const horizon = addMinutes(now, 60 * 24 * CALENDAR_SLOT_WINDOW_DAYS);

  const doctorLinks = await db
    .select({
      doctorUserId: doctorPatients.doctorUserId,
      doctorName: user.name,
      status: doctorPatients.status,
    })
    .from(doctorPatients)
    .innerJoin(user, eq(doctorPatients.doctorUserId, user.id))
    .where(
      and(
        eq(doctorPatients.patientUserId, patientUserId),
        inArray(doctorPatients.status, [...ACTIVE_PATIENT_LINK_STATUSES]),
      ),
    )
    .orderBy(asc(user.name));

  const availableSlotsPromise = db
    .select({
      slotId: appointmentSlots.id,
      doctorUserId: appointmentSlots.doctorUserId,
      doctorName: user.name,
      startsAt: appointmentSlots.startsAt,
      endsAt: appointmentSlots.endsAt,
    })
    .from(appointmentSlots)
    .innerJoin(user, eq(appointmentSlots.doctorUserId, user.id))
    .where(
      and(
        eq(appointmentSlots.status, "OPEN"),
        gte(appointmentSlots.startsAt, now),
        lte(appointmentSlots.startsAt, horizon),
      ),
    )
      .orderBy(asc(appointmentSlots.startsAt))
      .limit(CALENDAR_SLOT_FETCH_LIMIT);

  const [rawAvailableSlots, bookedAppointments] = await Promise.all([
    availableSlotsPromise,
    db
      .select({
        appointmentId: appointments.id,
        doctorUserId: appointments.doctorUserId,
        doctorName: user.name,
        status: appointments.status,
        startsAt: appointmentSlots.startsAt,
        endsAt: appointmentSlots.endsAt,
      })
      .from(appointments)
      .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
      .innerJoin(user, eq(appointments.doctorUserId, user.id))
      .where(
        and(
          eq(appointments.patientUserId, patientUserId),
          ne(appointments.status, "CANCELLED"),
        ),
      )
      .orderBy(desc(appointmentSlots.startsAt))
      .limit(120),
  ]);

  const actionableBookedIntervals = bookedAppointments
    .filter(
      (item) =>
        (item.status === "BOOKED" || item.status === "CONFIRMED") &&
        item.endsAt > now,
    )
    .map((item) => ({
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    }));

  const availableSlots = rawAvailableSlots.filter(
    (slot) =>
      !actionableBookedIntervals.some((booked) =>
        intervalsOverlap(
          { startsAt: slot.startsAt, endsAt: slot.endsAt },
          booked,
        ),
      ),
  );

  return {
    doctorLinks,
    availableSlots,
    bookedAppointments,
  };
}

export async function bookPatientAppointmentSlot(
  currentUser: AuthenticatedUser,
  input: { slotId: string; bookingMessage?: string },
) {
  const patientUserId = await requirePatient(currentUser);

  const [slot] = await db
    .select({
      slotId: appointmentSlots.id,
      doctorUserId: appointmentSlots.doctorUserId,
      startsAt: appointmentSlots.startsAt,
      endsAt: appointmentSlots.endsAt,
      status: appointmentSlots.status,
    })
    .from(appointmentSlots)
    .where(eq(appointmentSlots.id, input.slotId))
    .limit(1);

  if (!slot) throw new Error("Slot not found.");
  if (slot.status !== "OPEN") throw new Error("This slot is no longer available.");
  if (slot.startsAt < new Date()) throw new Error("Cannot book a past slot.");

  const [overlapBeforeBooking] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
    .where(
      and(
        eq(appointments.patientUserId, patientUserId),
        inArray(appointments.status, ["BOOKED", "CONFIRMED"]),
        lt(appointmentSlots.startsAt, slot.endsAt),
        gt(appointmentSlots.endsAt, slot.startsAt),
      ),
    )
    .limit(1);

  if (overlapBeforeBooking) {
    throw new Error(
      "You already have an appointment that overlaps this time window.",
    );
  }

  const [existingLink] = await db
    .select({
      id: doctorPatients.id,
      status: doctorPatients.status,
    })
    .from(doctorPatients)
    .where(
      and(
        eq(doctorPatients.doctorUserId, slot.doctorUserId),
        eq(doctorPatients.patientUserId, patientUserId),
      ),
    )
    .limit(1);

  if (
    existingLink &&
    !ACTIVE_PATIENT_LINK_STATUSES.includes(
      existingLink.status as (typeof ACTIVE_PATIENT_LINK_STATUSES)[number],
    )
  ) {
    throw new Error("You are not allowed to book with this doctor.");
  }

  const appointmentId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      if (!existingLink) {
        await tx
          .insert(doctorPatients)
          .values({
            id: crypto.randomUUID(),
            doctorUserId: slot.doctorUserId,
            patientUserId,
            status: "ACTIVE",
            createdAt: new Date(),
          })
          .onDuplicateKeyUpdate({
            set: {
              id: sql`${doctorPatients.id}`,
            },
          });
      }

      const [currentLink] = await tx
        .select({
          status: doctorPatients.status,
        })
        .from(doctorPatients)
        .where(
          and(
            eq(doctorPatients.doctorUserId, slot.doctorUserId),
            eq(doctorPatients.patientUserId, patientUserId),
          ),
        )
        .limit(1);

      if (
        !currentLink ||
        !ACTIVE_PATIENT_LINK_STATUSES.includes(
          currentLink.status as (typeof ACTIVE_PATIENT_LINK_STATUSES)[number],
        )
      ) {
        throw new Error("You are not allowed to book with this doctor.");
      }

      const [overlapInTx] = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .innerJoin(
          appointmentSlots,
          eq(appointments.slotId, appointmentSlots.id),
        )
        .where(
          and(
            eq(appointments.patientUserId, patientUserId),
            inArray(appointments.status, ["BOOKED", "CONFIRMED"]),
            lt(appointmentSlots.startsAt, slot.endsAt),
            gt(appointmentSlots.endsAt, slot.startsAt),
          ),
        )
        .limit(1);

      if (overlapInTx) {
        throw new Error(
          "You already have an appointment that overlaps this time window.",
        );
      }

      await tx.insert(appointments).values({
        id: appointmentId,
        slotId: slot.slotId,
        doctorUserId: slot.doctorUserId,
        patientUserId,
        status: "BOOKED",
        createdAt: new Date(),
      });

      await tx
        .update(appointmentSlots)
        .set({ status: "BOOKED" })
        .where(eq(appointmentSlots.id, slot.slotId));
    });
  } catch {
    throw new Error("Slot booking failed. It may already be booked.");
  }

  const roomId = await getOrCreateAppointmentSessionRoom(
    appointmentId,
    slot.doctorUserId,
    patientUserId,
  );
  const bookingMessage = input.bookingMessage?.trim();
  if (bookingMessage) {
    const now = new Date();
    const messageId = crypto.randomUUID();
    const clientTimestamp = Date.now();
    await db
      .update(chatRooms)
      .set({ lastMessageAt: now })
      .where(eq(chatRooms.id, roomId));

    await emitChatRealtimeAndBuffer({
      id: messageId,
      roomId,
      senderUserId: patientUserId,
      senderName: currentUser.name,
      text: bookingMessage.slice(0, 4000),
      createdAt: now,
      clientTimestamp,
    });
  }

  const [doctorRow] = await db
    .select({
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, slot.doctorUserId))
    .limit(1);

  const staffRows = await db
    .select({
      staffName: user.name,
      staffEmail: user.email,
    })
    .from(doctorStaff)
    .innerJoin(user, eq(doctorStaff.staffUserId, user.id))
    .where(
      and(
        eq(doctorStaff.doctorUserId, slot.doctorUserId),
        eq(doctorStaff.isActive, true),
      ),
    );

  const doctorName = doctorRow?.name ?? "Doctor";

  await sendMailSafely("send appointment booked email to patient", () =>
    sendAppointmentBookedToPatientEmail({
      appointmentId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      doctorName,
      patientName: currentUser.name,
      patientEmail: currentUser.email,
    }),
  );

  if (doctorRow?.email) {
    await sendMailSafely("send appointment booked email to doctor", () =>
      sendAppointmentBookedToDoctorEmail({
        appointmentId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        doctorName,
        doctorEmail: doctorRow.email,
        patientName: currentUser.name,
      }),
    );
  }

  for (const staff of staffRows) {
    await sendMailSafely(
      `send appointment booked email to staff ${staff.staffEmail}`,
      () =>
        sendAppointmentBookedToStaffEmail({
          appointmentId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          doctorName,
          patientName: currentUser.name,
          staffEmail: staff.staffEmail,
          staffName: staff.staffName,
        }),
    );
  }
}

export async function uploadEncryptedReport(
  currentUser: AuthenticatedUser,
  input: {
    patientUserId: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileBuffer: Buffer;
    appointmentId?: string | null;
  },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const title = input.title.trim();
  if (!title) throw new Error("Report title is required.");
  if (!input.fileBuffer.length) throw new Error("Uploaded file is empty.");

  await ensureLinkedPatient(doctorUserId, input.patientUserId);

  const [patientRow] = await db
    .select({
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, input.patientUserId))
    .limit(1);
  if (!patientRow || patientRow.role !== "PATIENT") {
    throw new Error("Invalid patient account.");
  }

  const [doctorKeyMeta, patientKeyMeta, staffRows] = await Promise.all([
    getActiveUserKeyMeta(doctorUserId),
    getActiveUserKeyMeta(input.patientUserId),
    db
      .select({
        staffUserId: doctorStaff.staffUserId,
      })
      .from(doctorStaff)
      .where(
        and(
          eq(doctorStaff.doctorUserId, doctorUserId),
          eq(doctorStaff.isActive, true),
        ),
      ),
  ]);

  const staffKeyMetaRows = (
    await Promise.all(
      staffRows.map(async (row) => {
        try {
          const keyMeta = await getActiveUserKeyMeta(row.staffUserId);
          return {
            staffUserId: row.staffUserId,
            keyMeta,
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((row): row is { staffUserId: string; keyMeta: Awaited<ReturnType<typeof getActiveUserKeyMeta>> } => row !== null);

  const documentId = crypto.randomUUID();
  const dek = crypto.randomBytes(32);
  const fileIv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, fileIv);
  const encryptedFile = Buffer.concat([
    cipher.update(input.fileBuffer),
    cipher.final(),
  ]);
  const fileTag = cipher.getAuthTag();
  const storageKey = await persistEncryptedFile(documentId, encryptedFile);
  const contentSha256 = crypto
    .createHash("sha256")
    .update(input.fileBuffer)
    .digest("hex");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(documents).values({
      id: documentId,
      ownerDoctorUserId: doctorUserId,
      appointmentId: input.appointmentId ?? null,
      patientUserId: input.patientUserId,
      uploadedByUserId: doctorUserId,
      title,
      originalFileName: input.fileName,
      mimeType: input.mimeType || "application/octet-stream",
      fileSizeBytes: input.fileBuffer.length,
      storageKey,
      contentSha256,
      encryptedAlgo: "AES-256-GCM",
      encryptedIv: fileIv.toString("base64"),
      encryptedTag: fileTag.toString("base64"),
      createdAt: now,
    });

    await tx.insert(documentAccess).values([
      {
        id: crypto.randomUUID(),
        documentId,
        userId: doctorUserId,
        roleAtGrant: "DOCTOR",
        canRead: true,
        canWrite: true,
        grantedByUserId: doctorUserId,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        documentId,
        userId: input.patientUserId,
        roleAtGrant: "PATIENT",
        canRead: true,
        canWrite: false,
        grantedByUserId: doctorUserId,
        createdAt: now,
      },
      ...staffKeyMetaRows.map((row) => ({
        id: crypto.randomUUID(),
        documentId,
        userId: row.staffUserId,
        roleAtGrant: "STAFF" as const,
        canRead: true,
        canWrite: false,
        grantedByUserId: doctorUserId,
        createdAt: now,
      })),
    ]);

    await tx.insert(documentKeyrings).values([
      {
        id: crypto.randomUUID(),
        documentId,
        userId: doctorUserId,
        userKeyVersion: doctorKeyMeta.keyVersion,
        wrappedDek: wrapDek(doctorKeyMeta, dek),
        wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        documentId,
        userId: input.patientUserId,
        userKeyVersion: patientKeyMeta.keyVersion,
        wrappedDek: wrapDek(patientKeyMeta, dek),
        wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
        createdAt: now,
      },
      ...staffKeyMetaRows.map((row) => ({
        id: crypto.randomUUID(),
        documentId,
        userId: row.staffUserId,
        userKeyVersion: row.keyMeta.keyVersion,
        wrappedDek: wrapDek(row.keyMeta, dek),
        wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
        createdAt: now,
      })),
    ]);
  });

  await sendMailSafely("send report uploaded email to patient", () =>
    sendReportUploadedEmailToPatient({
      patientEmail: patientRow.email,
      patientName: patientRow.name,
      doctorName: currentUser.name,
      reportTitle: title,
      appointmentId: input.appointmentId ?? null,
    }),
  );

  return documentId;
}

async function getReadableDocumentForUser(userId: string, documentId: string) {
  const [[row], [viewer]] = await Promise.all([
    db
      .select({
        id: documents.id,
        ownerDoctorUserId: documents.ownerDoctorUserId,
        patientUserId: documents.patientUserId,
        title: documents.title,
        originalFileName: documents.originalFileName,
        mimeType: documents.mimeType,
        storageKey: documents.storageKey,
        encryptedIv: documents.encryptedIv,
        encryptedTag: documents.encryptedTag,
        canRead: documentAccess.canRead,
        canWrite: documentAccess.canWrite,
      })
      .from(documents)
      .leftJoin(
        documentAccess,
        and(
          eq(documentAccess.documentId, documents.id),
          eq(documentAccess.userId, userId),
        ),
      )
      .where(eq(documents.id, documentId))
      .limit(1),
    db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ]);

  if (!row) {
    throw new Error("Report not found.");
  }
  if (!viewer) {
    throw new Error("User not found.");
  }

  if (row.ownerDoctorUserId !== userId && !row.canRead && !row.canWrite) {
    throw new Error("You do not have access to this report.");
  }

  if (viewer.role === "STAFF") {
    const [activeAssignment] = await db
      .select({ id: doctorStaff.id })
      .from(doctorStaff)
      .where(
        and(
          eq(doctorStaff.doctorUserId, row.ownerDoctorUserId),
          eq(doctorStaff.staffUserId, userId),
          eq(doctorStaff.isActive, true),
        ),
      )
      .limit(1);

    if (!activeAssignment) {
      throw new Error("Staff access has been revoked for this report.");
    }
  }

  return row;
}

async function rotateDocumentEncryptionForAccessibleUsers(input: {
  documentId: string;
  decryptingUserId: string;
}) {
  const [documentRow, decryptingKeyMeta, sourceKeyring, accessRows] =
    await Promise.all([
      getReadableDocumentForUser(input.decryptingUserId, input.documentId),
      getActiveUserKeyMeta(input.decryptingUserId),
      getLatestUserKeyring(input.documentId, input.decryptingUserId),
      db
        .select({
          userId: documentAccess.userId,
          canRead: documentAccess.canRead,
          canWrite: documentAccess.canWrite,
        })
        .from(documentAccess)
        .where(eq(documentAccess.documentId, input.documentId)),
    ]);

  if (!sourceKeyring) {
    throw new Error("Source document keyring not found for re-encryption.");
  }

  const sourceDek = unwrapDek(
    {
      ...decryptingKeyMeta,
      keyVersion: sourceKeyring.userKeyVersion,
    },
    sourceKeyring.wrappedDek,
  );

  const oldEncryptedBytes = await readEncryptedFile(documentRow.storageKey);
  const plainBytes = decryptFileWithDek({
    encryptedBytes: oldEncryptedBytes,
    dek: sourceDek,
    ivBase64: documentRow.encryptedIv,
    tagBase64: documentRow.encryptedTag,
  });

  const newDek = crypto.randomBytes(32);
  const nextEncrypted = encryptFileWithDek(plainBytes, newDek);
  const contentSha256 = crypto
    .createHash("sha256")
    .update(plainBytes)
    .digest("hex");

  const recipientIds = Array.from(
    new Set([
      documentRow.ownerDoctorUserId,
      documentRow.patientUserId,
      ...accessRows
        .filter((row) => row.canRead || row.canWrite)
        .map((row) => row.userId),
    ]),
  );

  const recipientMetas = (
    await Promise.all(
      recipientIds.map(async (userId) => {
        try {
          return await getActiveUserKeyMeta(userId);
        } catch {
          return null;
        }
      }),
    )
  ).filter((row): row is Awaited<ReturnType<typeof getActiveUserKeyMeta>> => row !== null);

  if (recipientMetas.length === 0) {
    throw new Error("No active user keys available for report re-encryption.");
  }

  const recipientsWithKeys = new Set(recipientMetas.map((row) => row.userId));
  const revokedUserIds = recipientIds.filter((userId) => !recipientsWithKeys.has(userId));

  await writeEncryptedFile(documentRow.storageKey, nextEncrypted.encrypted);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          encryptedAlgo: "AES-256-GCM",
          encryptedIv: nextEncrypted.ivBase64,
          encryptedTag: nextEncrypted.tagBase64,
          contentSha256,
        })
        .where(eq(documents.id, input.documentId));

      await tx.delete(documentKeyrings).where(eq(documentKeyrings.documentId, input.documentId));

      if (revokedUserIds.length > 0) {
        await tx
          .delete(documentAccess)
          .where(
            and(
              eq(documentAccess.documentId, input.documentId),
              inArray(documentAccess.userId, revokedUserIds),
            ),
          );
      }

      await tx.insert(documentKeyrings).values(
        recipientMetas.map((meta) => ({
          id: crypto.randomUUID(),
          documentId: input.documentId,
          userId: meta.userId,
          userKeyVersion: meta.keyVersion,
          wrappedDek: wrapDek(meta, newDek),
          wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
          createdAt: new Date(),
        })),
      );
    });
  } catch (error) {
    await writeEncryptedFile(documentRow.storageKey, oldEncryptedBytes);
    throw error;
  }
}

export async function downloadReportForUser(
  currentUser: AuthenticatedUser,
  documentId: string,
) {
  const doc = await getReadableDocumentForUser(currentUser.id, documentId);
  const keyMeta = await getActiveUserKeyMeta(currentUser.id);
  const keyring = await getLatestUserKeyring(documentId, currentUser.id);
  if (!keyring) {
    throw new Error("No document key available for this account.");
  }

  const dek = unwrapDek(
    {
      ...keyMeta,
      keyVersion: keyring.userKeyVersion,
    },
    keyring.wrappedDek,
  );
  const encryptedBytes = await readEncryptedFile(doc.storageKey);
  const plainBytes = decryptFileWithDek({
    encryptedBytes,
    dek,
    ivBase64: doc.encryptedIv,
    tagBase64: doc.encryptedTag,
  });

  return {
    bytes: plainBytes,
    fileName: doc.originalFileName,
    mimeType: doc.mimeType || "application/octet-stream",
    title: doc.title,
  };
}

export async function createReportAccessRecoveryRequestsForPatient(
  patientUserId: string,
) {
  const activeLinks = await db
    .select({
      doctorUserId: doctorPatients.doctorUserId,
    })
    .from(doctorPatients)
    .where(
      and(
        eq(doctorPatients.patientUserId, patientUserId),
        eq(doctorPatients.status, "ACTIVE"),
      ),
    );

  let totalRequests = 0;
  let totalItems = 0;
  for (const link of activeLinks) {
    const docs = await db
      .select({
        documentId: documents.id,
      })
      .from(documents)
      .innerJoin(
        documentAccess,
        and(
          eq(documentAccess.documentId, documents.id),
          eq(documentAccess.userId, patientUserId),
          eq(documentAccess.canRead, true),
        ),
      )
      .where(eq(documents.ownerDoctorUserId, link.doctorUserId));

    if (docs.length === 0) continue;

    const [existingPendingRequest] = await db
      .select({
        id: reportAccessRequests.id,
      })
      .from(reportAccessRequests)
      .where(
        and(
          eq(reportAccessRequests.patientUserId, patientUserId),
          eq(reportAccessRequests.doctorUserId, link.doctorUserId),
          eq(reportAccessRequests.status, "PENDING"),
          eq(reportAccessRequests.reason, "PASSWORD_RESET"),
        ),
      )
      .orderBy(desc(reportAccessRequests.createdAt))
      .limit(1);

    if (existingPendingRequest) {
      const existingItems = await db
        .select({
          documentId: reportAccessRequestItems.documentId,
        })
        .from(reportAccessRequestItems)
        .where(eq(reportAccessRequestItems.requestId, existingPendingRequest.id));

      const existingDocumentIds = new Set(
        existingItems.map((row) => row.documentId),
      );
      const missingDocs = docs.filter(
        (doc) => !existingDocumentIds.has(doc.documentId),
      );

      if (missingDocs.length > 0) {
        const now = new Date();
        await db.insert(reportAccessRequestItems).values(
          missingDocs.map((doc) => ({
            id: crypto.randomUUID(),
            requestId: existingPendingRequest.id,
            documentId: doc.documentId,
            status: "PENDING",
            createdAt: now,
          })),
        );
        totalItems += missingDocs.length;
      }

      continue;
    }

    const requestId = crypto.randomUUID();
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(reportAccessRequests).values({
        id: requestId,
        patientUserId,
        doctorUserId: link.doctorUserId,
        status: "PENDING",
        reason: "PASSWORD_RESET",
        createdAt: now,
      });

      await tx.insert(reportAccessRequestItems).values(
        docs.map((doc) => ({
          id: crypto.randomUUID(),
          requestId,
          documentId: doc.documentId,
          status: "PENDING",
          createdAt: now,
        })),
      );
    });

    totalRequests += 1;
    totalItems += docs.length;
  }

  return { totalRequests, totalItems };
}

export async function resolveReportAccessRecoveryRequest(
  currentUser: AuthenticatedUser,
  input: { requestId: string; decision: "APPROVE" | "REJECT" },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const [request] = await db
    .select({
      id: reportAccessRequests.id,
      doctorUserId: reportAccessRequests.doctorUserId,
      status: reportAccessRequests.status,
      patientUserId: reportAccessRequests.patientUserId,
    })
    .from(reportAccessRequests)
    .where(eq(reportAccessRequests.id, input.requestId))
    .limit(1);

  if (!request || request.doctorUserId !== doctorUserId) {
    throw new Error("Recovery request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("Recovery request is already resolved.");
  }

  const now = new Date();
  if (input.decision === "REJECT") {
    await db.transaction(async (tx) => {
      await tx
        .update(reportAccessRequests)
        .set({
          status: "REJECTED",
          resolvedAt: now,
          resolvedByUserId: doctorUserId,
        })
        .where(eq(reportAccessRequests.id, request.id));

      await tx
        .update(reportAccessRequestItems)
        .set({ status: "FAILED" })
        .where(eq(reportAccessRequestItems.requestId, request.id));
    });
    return;
  }

  const items = await db
    .select({
      id: reportAccessRequestItems.id,
      documentId: reportAccessRequestItems.documentId,
    })
    .from(reportAccessRequestItems)
    .where(eq(reportAccessRequestItems.requestId, request.id));

  for (const item of items) {
    try {
      await rotateDocumentEncryptionForAccessibleUsers({
        documentId: item.documentId,
        decryptingUserId: doctorUserId,
      });

      await db
        .update(reportAccessRequestItems)
        .set({ status: "REKEYED" })
        .where(eq(reportAccessRequestItems.id, item.id));
    } catch {
      await db
        .update(reportAccessRequestItems)
        .set({ status: "FAILED" })
        .where(eq(reportAccessRequestItems.id, item.id));
    }
  }

  await db
    .update(reportAccessRequests)
    .set({
      status: "APPROVED",
      resolvedAt: now,
      resolvedByUserId: doctorUserId,
    })
    .where(eq(reportAccessRequests.id, request.id));
}

export async function setStaffReportVisibility(
  currentUser: AuthenticatedUser,
  input: {
    documentId: string;
    staffUserId: string;
    visible: boolean;
  },
) {
  const doctorUserId = await requireDoctor(currentUser);

  const [[doc], [assignment]] = await Promise.all([
    db
      .select({
        id: documents.id,
        ownerDoctorUserId: documents.ownerDoctorUserId,
      })
      .from(documents)
      .where(eq(documents.id, input.documentId))
      .limit(1),
    db
      .select({
        id: doctorStaff.id,
      })
      .from(doctorStaff)
      .where(
        and(
          eq(doctorStaff.doctorUserId, doctorUserId),
          eq(doctorStaff.staffUserId, input.staffUserId),
        ),
      )
      .limit(1),
  ]);

  if (!doc || doc.ownerDoctorUserId !== doctorUserId) {
    throw new Error("Report not found in this doctor tenant.");
  }
  if (!assignment) {
    throw new Error("Staff user is not assigned to this doctor.");
  }
  if (input.visible) {
    const [activeAssignment] = await db
      .select({ id: doctorStaff.id })
      .from(doctorStaff)
      .where(
        and(
          eq(doctorStaff.doctorUserId, doctorUserId),
          eq(doctorStaff.staffUserId, input.staffUserId),
          eq(doctorStaff.isActive, true),
        ),
      )
      .limit(1);
    if (!activeAssignment) {
      throw new Error("Cannot grant report access to an inactive staff account.");
    }
  }

  if (!input.visible) {
    await db.transaction(async (tx) => {
      await tx
        .delete(documentKeyrings)
        .where(
          and(
            eq(documentKeyrings.documentId, input.documentId),
            eq(documentKeyrings.userId, input.staffUserId),
          ),
        );
      await tx
        .delete(documentAccess)
        .where(
          and(
            eq(documentAccess.documentId, input.documentId),
            eq(documentAccess.userId, input.staffUserId),
          ),
        );
    });
    return;
  }

  const [staffKeyMeta, doctorKeyMeta, sourceKeyring] = await Promise.all([
    getActiveUserKeyMeta(input.staffUserId),
    getActiveUserKeyMeta(doctorUserId),
    getLatestUserKeyring(input.documentId, doctorUserId),
  ]);

  if (!sourceKeyring) {
    throw new Error("Doctor key material missing for this report.");
  }

  const dek = unwrapDek(
    {
      ...doctorKeyMeta,
      keyVersion: sourceKeyring.userKeyVersion,
    },
    sourceKeyring.wrappedDek,
  );
  const wrappedForStaff = wrapDek(staffKeyMeta, dek);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(documentAccess)
      .values({
        id: crypto.randomUUID(),
        documentId: input.documentId,
        userId: input.staffUserId,
        roleAtGrant: "STAFF",
        canRead: true,
        canWrite: false,
        grantedByUserId: doctorUserId,
        createdAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          canRead: true,
          canWrite: false,
          grantedByUserId: doctorUserId,
        },
      });

    await tx
      .insert(documentKeyrings)
      .values({
        id: crypto.randomUUID(),
        documentId: input.documentId,
        userId: input.staffUserId,
        userKeyVersion: staffKeyMeta.keyVersion,
        wrappedDek: wrappedForStaff,
        wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
        createdAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          wrappedDek: wrappedForStaff,
          userKeyVersion: staffKeyMeta.keyVersion,
          wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
          createdAt: now,
        },
      });
  });
}

export async function requestDocumentShare(
  currentUser: AuthenticatedUser,
  input: { documentId: string; toDoctorUserId: string; note?: string },
) {
  const doctorUserId = await requireDoctor(currentUser);
  if (input.toDoctorUserId === doctorUserId) {
    throw new Error("Cannot share report with yourself.");
  }

  const [doc] = await db
    .select({
      id: documents.id,
      patientUserId: documents.patientUserId,
      ownerDoctorUserId: documents.ownerDoctorUserId,
      title: documents.title,
    })
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .limit(1);

  if (!doc || doc.ownerDoctorUserId !== doctorUserId) {
    throw new Error("Report not found or not owned by this doctor.");
  }

  const [targetDoctor] = await db
    .select({ id: user.id, role: user.role, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, input.toDoctorUserId))
    .limit(1);

  if (!targetDoctor || targetDoctor.role !== "DOCTOR") {
    throw new Error("Target account is not a doctor.");
  }

  await ensureLinkedPatient(input.toDoctorUserId, doc.patientUserId);

  await db
    .insert(documentShares)
    .values({
      id: crypto.randomUUID(),
      documentId: doc.id,
      fromDoctorUserId: doctorUserId,
      toDoctorUserId: input.toDoctorUserId,
      status: "PENDING",
      note: input.note?.trim() || null,
      createdAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        status: "PENDING",
        note: input.note?.trim() || null,
        respondedAt: null,
      },
    });

  await sendMailSafely("send report share request email to target doctor", () =>
    sendReportShareRequestEmailToDoctor({
      targetDoctorEmail: targetDoctor.email,
      targetDoctorName: targetDoctor.name,
      fromDoctorName: currentUser.name,
      documentTitle: doc.title,
    }),
  );
}

export async function respondToIncomingShare(
  currentUser: AuthenticatedUser,
  input: { shareId: string; decision: "ACCEPTED" | "REJECTED" },
) {
  const doctorUserId = await requireDoctor(currentUser);
  const [share] = await db
    .select({
      id: documentShares.id,
      status: documentShares.status,
      documentId: documentShares.documentId,
      fromDoctorUserId: documentShares.fromDoctorUserId,
      toDoctorUserId: documentShares.toDoctorUserId,
      patientUserId: documents.patientUserId,
    })
    .from(documentShares)
    .innerJoin(documents, eq(documentShares.documentId, documents.id))
    .where(eq(documentShares.id, input.shareId))
    .limit(1);

  if (!share || share.toDoctorUserId !== doctorUserId) {
    throw new Error("Share request not found.");
  }
  if (share.status !== "PENDING") {
    throw new Error("Share request has already been resolved.");
  }

  if (input.decision === "REJECTED") {
    await db
      .update(documentShares)
      .set({
        status: "REJECTED",
        respondedAt: new Date(),
      })
      .where(eq(documentShares.id, share.id));
    return;
  }

  await ensureLinkedPatient(doctorUserId, share.patientUserId);

  const [sourceKeyring] = await db
    .select({
      wrappedDek: documentKeyrings.wrappedDek,
      userKeyVersion: documentKeyrings.userKeyVersion,
    })
    .from(documentKeyrings)
    .where(
      and(
        eq(documentKeyrings.documentId, share.documentId),
        eq(documentKeyrings.userId, share.fromDoctorUserId),
      ),
    )
    .orderBy(desc(documentKeyrings.userKeyVersion))
    .limit(1);

  if (!sourceKeyring) {
    throw new Error("Source key material not found for document share.");
  }

  const [sourceKeyMeta, targetKeyMeta] = await Promise.all([
    getActiveUserKeyMeta(share.fromDoctorUserId),
    getActiveUserKeyMeta(doctorUserId),
  ]);

  let dek: Buffer;
  try {
    dek = unwrapDek(
      {
        ...sourceKeyMeta,
        keyVersion: sourceKeyring.userKeyVersion,
      },
      sourceKeyring.wrappedDek,
    );
  } catch {
    throw new Error("Failed to unwrap source report key.");
  }

  const wrappedForTarget = wrapDek(targetKeyMeta, dek);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(documentAccess)
      .values({
        id: crypto.randomUUID(),
        documentId: share.documentId,
        userId: doctorUserId,
        roleAtGrant: "DOCTOR",
        canRead: true,
        canWrite: false,
        grantedByUserId: share.fromDoctorUserId,
        createdAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          canRead: true,
          grantedByUserId: share.fromDoctorUserId,
        },
      });

    await tx
      .insert(documentKeyrings)
      .values({
        id: crypto.randomUUID(),
        documentId: share.documentId,
        userId: doctorUserId,
        userKeyVersion: targetKeyMeta.keyVersion,
        wrappedDek: wrappedForTarget,
        wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
        createdAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          wrappedDek: wrappedForTarget,
          wrapAlgo: "AES-256-GCM/USER-SIGNATURE-KDF-v1",
          createdAt: now,
        },
      });

    await tx
      .update(documentShares)
      .set({
        status: "ACCEPTED",
        respondedAt: now,
      })
      .where(eq(documentShares.id, share.id));
  });
}
