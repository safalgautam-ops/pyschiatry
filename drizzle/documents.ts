import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  boolean,
  int,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";
import { appointments } from "./scheduling";

/**
 * Encrypted documents + access control + keyrings + sharing
 */

export const documents = mysqlTable(
  "documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),

    // NEW: hard scoping for multi-doctor
    ownerDoctorUserId: varchar("owner_doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    appointmentId: varchar("appointment_id", { length: 36 }).references(
      () => appointments.id,
      { onDelete: "set null" },
    ),

    patientUserId: varchar("patient_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    uploadedByUserId: varchar("uploaded_by_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 255 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    fileSizeBytes: int("file_size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    contentSha256: varchar("content_sha256", { length: 64 }).notNull(),

    encryptedAlgo: varchar("encrypted_algo", { length: 64 }).notNull(),
    encryptedIv: text("encrypted_iv").notNull(),
    encryptedTag: text("encrypted_tag").notNull(),

    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [
    index("docs_owner_idx").on(t.ownerDoctorUserId, t.createdAt),
    index("docs_patient_idx").on(t.patientUserId, t.createdAt),
    index("docs_appt_idx").on(t.appointmentId),
  ],
);

export const documentAccess = mysqlTable(
  "document_access",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    documentId: varchar("document_id", { length: 36 })
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    roleAtGrant: varchar("role_at_grant", { length: 16 }).notNull(), // DOCTOR|PATIENT|STAFF
    canRead: boolean("can_read").default(true).notNull(),
    canWrite: boolean("can_write").default(false).notNull(),

    grantedByUserId: varchar("granted_by_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("doc_access_unique").on(t.documentId, t.userId),
    index("doc_access_user_idx").on(t.userId),
    index("doc_access_doc_idx").on(t.documentId),
  ],
);

export const documentKeyrings = mysqlTable(
  "document_keyrings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    documentId: varchar("document_id", { length: 36 })
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    userKeyVersion: int("user_key_version").notNull(),
    wrappedDek: text("wrapped_dek").notNull(),
    wrapAlgo: varchar("wrap_algo", { length: 64 }).notNull(),

    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [
    index("doc_keyrings_doc_idx").on(t.documentId),
    index("doc_keyrings_user_idx").on(t.userId),
    uniqueIndex("doc_keyrings_unique").on(t.documentId, t.userId, t.userKeyVersion),
  ],
);

/**
 * NEW: doctor-to-doctor sharing lifecycle
 * Actual access is still enforced by document_access + document_keyrings.
 */
export const documentShares = mysqlTable(
  "document_shares",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    documentId: varchar("document_id", { length: 36 })
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    fromDoctorUserId: varchar("from_doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    toDoctorUserId: varchar("to_doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    status: varchar("status", { length: 16 }).default("PENDING").notNull(), // PENDING|ACCEPTED|REJECTED|REVOKED
    note: text("note"),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    respondedAt: timestamp("responded_at", { fsp: 3 }),
  },
  (t) => [
    uniqueIndex("document_shares_unique").on(t.documentId, t.toDoctorUserId),
    index("document_shares_to_idx").on(t.toDoctorUserId, t.status),
    index("document_shares_from_idx").on(t.fromDoctorUserId, t.status),
  ],
);