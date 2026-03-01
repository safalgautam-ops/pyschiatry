import {
  mysqlTable,
  varchar,
  timestamp,
  int,
  date,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";

/**
 * Scheduling (per doctor user)
 */

export const scheduleRules = mysqlTable(
  "schedule_rules",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    dayOfWeek: int("day_of_week").notNull(), // 0-6
    startTime: varchar("start_time", { length: 5 }).notNull(), // HH:mm
    endTime: varchar("end_time", { length: 5 }).notNull(),
  },
  (t) => [index("schedule_rules_doctor_idx").on(t.doctorUserId)],
);

export const scheduleExceptions = mysqlTable(
  "schedule_exceptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    date: date("date").notNull(),
    type: varchar("type", { length: 16 }).notNull(), // OFF|CUSTOM_HOURS
    startTime: varchar("start_time", { length: 5 }),
    endTime: varchar("end_time", { length: 5 }),
    reason: text("reason"),
  },
  (t) => [index("schedule_exceptions_doctor_date_idx").on(t.doctorUserId, t.date)],
);

export const appointmentSlots = mysqlTable(
  "appointment_slots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    startsAt: timestamp("starts_at", { fsp: 3 }).notNull(),
    endsAt: timestamp("ends_at", { fsp: 3 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(), // OPEN|HELD|BOOKED|BLOCKED
    holdToken: varchar("hold_token", { length: 64 }),
    holdExpiresAt: timestamp("hold_expires_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("slot_unique_time").on(t.doctorUserId, t.startsAt, t.endsAt),
    index("slots_doctor_status_idx").on(t.doctorUserId, t.status),
    index("slots_start_idx").on(t.startsAt),
  ],
);

export const appointments = mysqlTable(
  "appointments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    slotId: varchar("slot_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => appointmentSlots.id, { onDelete: "restrict" }),

    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    patientUserId: varchar("patient_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    status: varchar("status", { length: 16 }).notNull(), // BOOKED|CONFIRMED|CANCELLED|COMPLETED
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at", { fsp: 3 }),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    index("appointments_doctor_idx").on(t.doctorUserId),
    index("appointments_patient_idx").on(t.patientUserId),
    index("appointments_status_idx").on(t.doctorUserId, t.status),
  ],
);