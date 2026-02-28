// src/db/schema/profiles.ts
import { relations } from "drizzle-orm";
import { mysqlTable, varchar, int, date, text, uniqueIndex } from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";

export const doctorProfile = mysqlTable(
  "doctor_profile",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    defaultSessionMinutes: int("default_session_minutes").default(60).notNull(),
    bufferMinutes: int("buffer_minutes").default(10).notNull(),
  },
  (t) => [uniqueIndex("doctor_profile_user_unique").on(t.userId)],
);

export const patientProfile = mysqlTable(
  "patient_profile",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dateOfBirth: date("date_of_birth"),
    gender: varchar("gender", { length: 32 }),
    emergencyContact: varchar("emergency_contact", { length: 255 }),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("patient_profile_user_unique").on(t.userId)],
);

export const staffProfile = mysqlTable(
  "staff_profile",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    staffRole: varchar("staff_role", { length: 16 }).notNull(), // ADMIN|RECEPTION
  },
  (t) => [uniqueIndex("staff_profile_user_unique").on(t.userId)],
);

// Profile relations (to user)
export const doctorProfileRelations = relations(doctorProfile, ({ one }) => ({
  user: one(user, { fields: [doctorProfile.userId], references: [user.id] }),
}));

export const patientProfileRelations = relations(patientProfile, ({ one }) => ({
  user: one(user, { fields: [patientProfile.userId], references: [user.id] }),
}));

export const staffProfileRelations = relations(staffProfile, ({ one }) => ({
  user: one(user, { fields: [staffProfile.userId], references: [user.id] }),
}));