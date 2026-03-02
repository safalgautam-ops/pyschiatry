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
  scheduleExceptions,
  scheduleRules,
  user,
  userKeys,
} from "@/drizzle";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ACTIVE_PATIENT_LINK_STATUSES = ["ACTIVE"] as const;
const CHAT_ELIGIBLE_APPOINTMENT_STATUSES = [
  "BOOKED",
  "CONFIRMED",
  "COMPLETED",
] as const;
const REPORT_WRAP_SECRET =
  process.env.REPORT_DEK_WRAP_SECRET ??
  process.env.USER_KEYS_ENCRYPTION_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  process.env.AUTH_SECRET ??
  "development-only-report-wrap-secret";

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

export async function getDoctorWorkspaceData(
  currentUser: AuthenticatedUser,
  selectedRoomId?: string | null,
): Promise<DoctorWorkspaceData> {
  const doctorUserId = await requireDoctor(currentUser);
  await syncDoctorRoomsFromBookedAppointments(doctorUserId);
  const now = new Date();
  const maxDate = addMinutes(now, 60 * 24 * 60);

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
        .where(eq(scheduleExceptions.doctorUserId, doctorUserId))
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
        .limit(80),
      db
        .select({
          id: appointments.id,
          patientUserId: appointments.patientUserId,
          patientName: user.name,
          status: appointments.status,
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

  const [roomMessages, roomPatients] = await Promise.all([
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
  ]);

  const latestMessageByRoomId = new Map<string, string>();
  for (const row of roomMessages) {
    if (latestMessageByRoomId.has(row.roomId)) continue;
    latestMessageByRoomId.set(row.roomId, row.text);
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

  const selectedRoomMessages =
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
      latestMessage: latestMessageByRoomId.get(room.id) ?? null,
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
  const bufferMinutes = profile?.bufferMinutes ?? 10;
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
  const [record] = await db
    .select({
      id: appointments.id,
      doctorUserId: appointments.doctorUserId,
    })
    .from(appointments)
    .where(eq(appointments.id, input.appointmentId))
    .limit(1);

  if (!record || record.doctorUserId !== doctorUserId) {
    throw new Error("Appointment not found in this doctor tenant.");
  }

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
  await db.transaction(async (tx) => {
    await tx.insert(chatMessages).values({
      id: crypto.randomUUID(),
      roomId: room.id,
      senderUserId: doctorUserId,
      text: message,
      createdAt: now,
      clientTimestamp: Date.now(),
      deliveryStatus: "SENT",
    });

    await tx
      .update(chatRooms)
      .set({ lastMessageAt: now })
      .where(eq(chatRooms.id, room.id));
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
  const messages = roomIds.length
    ? await db
        .select({
          roomId: chatMessages.roomId,
          text: chatMessages.text,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(inArray(chatMessages.roomId, roomIds))
        .orderBy(desc(chatMessages.createdAt))
    : [];

  const latestMessageByRoomId = new Map<string, string>();
  for (const row of messages) {
    if (latestMessageByRoomId.has(row.roomId)) continue;
    latestMessageByRoomId.set(row.roomId, row.text);
  }

  const hasSelectedRoom =
    typeof selectedRoomId === "string" &&
    rooms.some((room) => room.id === selectedRoomId);
  const activeRoomId = hasSelectedRoom ? selectedRoomId : (rooms[0]?.id ?? null);
  const selectedRoomMessages =
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

  return {
    rooms: rooms.map((room) => ({
      ...room,
      latestMessage: latestMessageByRoomId.get(room.id) ?? null,
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
  await db.transaction(async (tx) => {
    await tx.insert(chatMessages).values({
      id: crypto.randomUUID(),
      roomId: room.id,
      senderUserId: patientUserId,
      text,
      createdAt: now,
      clientTimestamp: Date.now(),
      deliveryStatus: "SENT",
    });

    await tx
      .update(chatRooms)
      .set({
        lastMessageAt: now,
      })
      .where(eq(chatRooms.id, room.id));
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
  const horizon = addMinutes(now, 60 * 24 * 60);

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

  const scopedDoctorIds = doctorLinks.map((row) => row.doctorUserId);
  if (scopedDoctorIds.length === 0) {
    return {
      doctorLinks: [],
      availableSlots: [],
      bookedAppointments: [],
    };
  }

  const [availableSlots, bookedAppointments] = await Promise.all([
    db
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
          inArray(appointmentSlots.doctorUserId, scopedDoctorIds),
          eq(appointmentSlots.status, "OPEN"),
          gte(appointmentSlots.startsAt, now),
          lte(appointmentSlots.startsAt, horizon),
        ),
      )
      .orderBy(asc(appointmentSlots.startsAt))
      .limit(300),
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

  return {
    doctorLinks,
    availableSlots,
    bookedAppointments,
  };
}

export async function bookPatientAppointmentSlot(
  currentUser: AuthenticatedUser,
  input: { slotId: string },
) {
  const patientUserId = await requirePatient(currentUser);

  const [slot] = await db
    .select({
      slotId: appointmentSlots.id,
      doctorUserId: appointmentSlots.doctorUserId,
      startsAt: appointmentSlots.startsAt,
      status: appointmentSlots.status,
    })
    .from(appointmentSlots)
    .where(eq(appointmentSlots.id, input.slotId))
    .limit(1);

  if (!slot) throw new Error("Slot not found.");
  if (slot.status !== "OPEN") throw new Error("This slot is no longer available.");
  if (slot.startsAt < new Date()) throw new Error("Cannot book a past slot.");

  await ensureLinkedPatient(slot.doctorUserId, patientUserId);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(appointments).values({
        id: crypto.randomUUID(),
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

  await getOrCreateDoctorPatientRoom(slot.doctorUserId, patientUserId);
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
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, input.patientUserId))
    .limit(1);
  if (!patientRow || patientRow.role !== "PATIENT") {
    throw new Error("Invalid patient account.");
  }

  const [doctorKeyMeta, patientKeyMeta] = await Promise.all([
    getActiveUserKeyMeta(doctorUserId),
    getActiveUserKeyMeta(input.patientUserId),
  ]);

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
    ]);
  });

  return documentId;
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
    })
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .limit(1);

  if (!doc || doc.ownerDoctorUserId !== doctorUserId) {
    throw new Error("Report not found or not owned by this doctor.");
  }

  const [targetDoctor] = await db
    .select({ id: user.id, role: user.role })
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
