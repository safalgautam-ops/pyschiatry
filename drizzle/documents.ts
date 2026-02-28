// src/db/schema/documents.ts
import { relations } from "drizzle-orm";
import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  int,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";
import { appointments } from "./scheduling";

export const documents = mysqlTable(
  "documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),

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
    index("docs_patient_idx").on(t.patientUserId),
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
  ],
);

// Relations for documents domain
export const documentsRelations = relations(documents, ({ one, many }) => ({
  appointment: one(appointments, { fields: [documents.appointmentId], references: [appointments.id] }),
  patient: one(user, { fields: [documents.patientUserId], references: [user.id] }),
  uploader: one(user, { fields: [documents.uploadedByUserId], references: [user.id] }),

  access: many(documentAccess),
  keyrings: many(documentKeyrings),
}));

export const documentAccessRelations = relations(documentAccess, ({ one }) => ({
  document: one(documents, { fields: [documentAccess.documentId], references: [documents.id] }),
  user: one(user, { fields: [documentAccess.userId], references: [user.id] }),
  grantedBy: one(user, { fields: [documentAccess.grantedByUserId], references: [user.id] }),
}));

export const documentKeyringsRelations = relations(documentKeyrings, ({ one }) => ({
  document: one(documents, { fields: [documentKeyrings.documentId], references: [documents.id] }),
  user: one(user, { fields: [documentKeyrings.userId], references: [user.id] }),
}));