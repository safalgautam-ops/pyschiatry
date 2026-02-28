// src/db/schema/chat.ts
import { relations } from "drizzle-orm";
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

export const chatRooms = mysqlTable(
  "chat_rooms",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    type: varchar("type", { length: 24 }).notNull(), // PATIENT_DOCTOR|PATIENT_STAFF

    patientUserId: varchar("patient_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    doctorUserId: varchar("doctor_user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    lastMessageAt: timestamp("last_message_at", { fsp: 3 }),
  },
  (t) => [index("chat_rooms_patient_doctor_idx").on(t.patientUserId, t.doctorUserId)],
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
    id: varchar("id", { length: 36 }).primaryKey(),

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
  (t) => [index("chat_messages_room_time_idx").on(t.roomId, t.createdAt)],
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

// Relations for chat domain
export const chatRoomsRelations = relations(chatRooms, ({ one, many }) => ({
  patient: one(user, { fields: [chatRooms.patientUserId], references: [user.id] }),
  doctor: one(user, { fields: [chatRooms.doctorUserId], references: [user.id] }),
  participants: many(chatParticipants),
  messages: many(chatMessages),
}));

export const chatParticipantsRelations = relations(chatParticipants, ({ one }) => ({
  room: one(chatRooms, { fields: [chatParticipants.roomId], references: [chatRooms.id] }),
  user: one(user, { fields: [chatParticipants.userId], references: [user.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  room: one(chatRooms, { fields: [chatMessages.roomId], references: [chatRooms.id] }),
  sender: one(user, { fields: [chatMessages.senderUserId], references: [user.id] }),
}));

export const chatMessageBatchesRelations = relations(chatMessageBatches, ({ one }) => ({
  room: one(chatRooms, { fields: [chatMessageBatches.roomId], references: [chatRooms.id] }),
}));