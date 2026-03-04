import {
  mysqlTable,
  varchar,
  timestamp,
  int,
  date,
  text,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";

/**
 * Role-specific profiles
 */

export const doctorProfile = mysqlTable(
  "doctor_profile",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    timezone: varchar("timezone", { length: 64 }).notNull(),
    defaultSessionMinutes: int("default_session_minutes").default(60).notNull(),
    bufferMinutes: int("buffer_minutes").default(10).notNull(),
  },
  (t) => [index("doctor_profile_user_idx").on(t.userId)],
);

export const patientProfile = mysqlTable(
  "patient_profile",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    dateOfBirth: date("date_of_birth"),
    gender: varchar("gender", { length: 32 }),
    emergencyContact: varchar("emergency_contact", { length: 255 }),
    notes: text("notes"),
  },
  (t) => [index("patient_profile_user_idx").on(t.userId)],
);

export const staffProfile = mysqlTable(
  "staff_profile",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    // generic “type”; doctor assignment happens in doctorStaff table
    staffRole: varchar("staff_role", { length: 16 }).notNull(), // ADMIN|RECEPTION
    username: varchar("username", { length: 64 }),
    jobTitle: varchar("job_title", { length: 128 }),
    address: varchar("address", { length: 255 }),
    notes: text("notes"),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    profileCompleted: boolean("profile_completed").default(true).notNull(),
    createdByDoctorUserId: varchar("created_by_doctor_user_id", { length: 36 }).references(
      () => user.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    index("staff_profile_user_idx").on(t.userId),
    uniqueIndex("staff_profile_username_unique").on(t.username),
    index("staff_profile_onboarding_idx").on(
      t.mustChangePassword,
      t.profileCompleted,
    ),
  ],
);

/**
 * Multi-doctor isolation tables
 * - a patient can be linked to many doctors
 * - a staff can serve many doctors
 */

export const doctorPatients = mysqlTable(
  "doctor_patients",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    patientUserId: varchar("patient_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).default("ACTIVE").notNull(), // ACTIVE|BLOCKED|ARCHIVED
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("doctor_patients_unique").on(t.doctorUserId, t.patientUserId),
    index("doctor_patients_doctor_idx").on(t.doctorUserId),
    index("doctor_patients_patient_idx").on(t.patientUserId),
    index("doctor_patients_status_idx").on(t.doctorUserId, t.status),
  ],
);

export const doctorStaff = mysqlTable(
  "doctor_staff",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    staffUserId: varchar("staff_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // role for THIS doctor assignment
    staffRole: varchar("staff_role", { length: 16 }).notNull(), // ADMIN|RECEPTION
    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("doctor_staff_unique").on(t.doctorUserId, t.staffUserId),
    index("doctor_staff_doctor_idx").on(t.doctorUserId, t.isActive),
    index("doctor_staff_staff_idx").on(t.staffUserId),
  ],
);
