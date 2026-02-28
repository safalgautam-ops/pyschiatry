// src/db/schema/recovery.ts
import { relations } from "drizzle-orm";
import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";
import { documents } from "./documents";

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
  ],
);

export const reportAccessRequestItems = mysqlTable(
  "report_access_request_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),

    requestId: varchar("request_id", { length: 36 }).notNull(),
    documentId: varchar("document_id", { length: 36 }).notNull(),

    status: varchar("status", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => ({
    requestFk: foreignKey({
      name: "rar_items_req_fk",   // ✅ SHORT NAME
      columns: [t.requestId],
      foreignColumns: [reportAccessRequests.id],
    }).onDelete("cascade"),

    documentFk: foreignKey({
      name: "rar_items_doc_fk",   // ✅ SHORT NAME
      columns: [t.documentId],
      foreignColumns: [documents.id],
    }).onDelete("cascade"),
  }),
);

// Relations for recovery domain
export const reportAccessRequestsRelations = relations(reportAccessRequests, ({ one, many }) => ({
  patient: one(user, { fields: [reportAccessRequests.patientUserId], references: [user.id] }),
  doctor: one(user, { fields: [reportAccessRequests.doctorUserId], references: [user.id] }),
  resolvedBy: one(user, { fields: [reportAccessRequests.resolvedByUserId], references: [user.id] }),
  items: many(reportAccessRequestItems),
}));

export const reportAccessRequestItemsRelations = relations(reportAccessRequestItems, ({ one }) => ({
  request: one(reportAccessRequests, { fields: [reportAccessRequestItems.requestId], references: [reportAccessRequests.id] }),
  document: one(documents, { fields: [reportAccessRequestItems.documentId], references: [documents.id] }),
}));