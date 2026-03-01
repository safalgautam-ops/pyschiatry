import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  int,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { user } from "./auth-schema";

/**
 * Durable chat tables (Redis buffer is ephemeral, not in DB)
 */

export const chatRooms = mysqlTable(
  "chat_rooms",
  {
    id: varchar("id", { length: 36 }).primaryKey(),

    // For multi-doctor scoping
    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // room can be patient-doctor or patient-staff
    type: varchar("type", { length: 24 }).notNull(), // PATIENT_DOCTOR|PATIENT_STAFF|DOCTOR_DOCTOR (optional)

    patientUserId: varchar("patient_user_id", { length: 36 }).references(() => user.id, {
      onDelete: "cascade",
    }),

    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    lastMessageAt: timestamp("last_message_at", { fsp: 3 }),
  },
  (t) => [
    index("chat_rooms_doctor_idx").on(t.doctorUserId, t.lastMessageAt),
    index("chat_rooms_patient_idx").on(t.patientUserId),
  ],
);

export const chatParticipants = mysqlTable(
  "chat_participants",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    roomId: varchar("room_id", { length: 36 })
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),

    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    role: varchar("role", { length: 16 }).notNull(), // PATIENT|DOCTOR|STAFF
    joinedAt: timestamp("joined_at", { fsp: 3 }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { fsp: 3 }),
  },
  (t) => [
    uniqueIndex("chat_participants_unique").on(t.roomId, t.userId),
    index("chat_participants_user_idx").on(t.userId),
  ],
);

export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(), // use your realtime message id
    roomId: varchar("room_id", { length: 36 })
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),

    senderUserId: varchar("sender_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    text: text("text").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull(),
    clientTimestamp: int("client_timestamp").notNull(),
    deliveryStatus: varchar("delivery_status", { length: 16 }).default("SENT").notNull(),

    replyToMessageId: varchar("reply_to_message_id", { length: 36 }),
    metadata: text("metadata"),
  },
  (t) => [
    index("chat_messages_room_time_idx").on(t.roomId, t.createdAt),
    index("chat_messages_sender_idx").on(t.senderUserId),
  ],
);

export const chatMessageBatches = mysqlTable(
  "chat_message_batches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    roomId: varchar("room_id", { length: 36 })
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),

    batchKey: varchar("batch_key", { length: 128 }).notNull(),
    messageCount: int("message_count").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
  },
  (t) => [index("chat_batches_room_idx").on(t.roomId)],
);