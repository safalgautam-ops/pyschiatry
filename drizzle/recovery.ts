import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";
import { documents } from "./documents";

/**
 * Permission-based recovery after password reset (doctor re-keys access)
 */

export const reportAccessRequests = mysqlTable(
  "report_access_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),

    patientUserId: varchar("patient_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    status: varchar("status", { length: 16 }).notNull(), // PENDING|APPROVED|REJECTED|CANCELLED
    reason: text("reason"),

    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { fsp: 3 }),
    resolvedByUserId: varchar("resolved_by_user_id", { length: 36 }).references(
      () => user.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    index("rar_patient_idx").on(t.patientUserId),
    index("rar_doctor_idx").on(t.doctorUserId),
    index("rar_status_idx").on(t.status),
    index("rar_doctor_status_idx").on(t.doctorUserId, t.status),
  ],
);

export const reportAccessRequestItems = mysqlTable(
  "report_access_request_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),

    // define columns without .references() so we can use named foreignKey() below
    requestId: varchar("request_id", { length: 36 }).notNull(),
    documentId: varchar("document_id", { length: 36 }).notNull(),

    status: varchar("status", { length: 16 }).notNull(), // PENDING|REKEYED|FAILED
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [
    // ✅ Short FK names (avoid MySQL 64-char identifier limit)
    foreignKey({
      name: "rar_items_req_fk",
      columns: [t.requestId],
      foreignColumns: [reportAccessRequests.id],
    }).onDelete("cascade"),

    foreignKey({
      name: "rar_items_doc_fk",
      columns: [t.documentId],
      foreignColumns: [documents.id],
    }).onDelete("cascade"),

    uniqueIndex("rar_item_unique").on(t.requestId, t.documentId),
    index("rar_item_doc_idx").on(t.documentId),
    index("rar_item_req_idx").on(t.requestId),
  ],
);