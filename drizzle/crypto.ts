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

/**
 * Crypto identity / key rotation
 */
export const userKeys = mysqlTable(
  "user_keys",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    keyVersion: int("key_version").notNull(),
    publicKey: text("public_key").notNull(),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    keyFingerprint: varchar("key_fingerprint", { length: 128 }).notNull(),
    signature: varchar("signature", { length: 128 }).notNull(),

    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { fsp: 3 }),
  },
  (t) => [
    uniqueIndex("user_keys_unique").on(t.userId, t.keyVersion),
    index("user_keys_active_idx").on(t.userId, t.isActive),
  ],
);