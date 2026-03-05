import crypto from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { chatMessageBatches, chatMessages, chatRooms } from "@/drizzle";
import { redis } from "@/lib/redis";
import { realtime } from "@/lib/realtime";

const CHAT_BUFFER_PREFIX = "chat:buffer:room:";
const CHAT_DIRTY_ROOMS_KEY = "chat:buffer:dirty-rooms";
const CHAT_FLUSH_LOCK_KEY = "chat:buffer:flush-lock";
const CHAT_NEXT_FLUSH_AT_KEY = "chat:buffer:next-flush-at";
const CHAT_NEXT_FLUSH_SCHEDULED_AT_KEY = "chat:buffer:next-flush-scheduled-at";

const DEFAULT_FLUSH_SECONDS = 30 * 60;
const FLUSH_INTERVAL_SECONDS = Math.max(
  60,
  Number(process.env.CHAT_BUFFER_FLUSH_INTERVAL_SECONDS ?? DEFAULT_FLUSH_SECONDS),
);

const QSTASH_PUBLISH_URL =
  process.env.QSTASH_PUBLISH_URL ?? "https://qstash.upstash.io/v2/publish";
const QSTASH_TOKEN =
  process.env.QSTASH_TOKEN ?? process.env.UPSTASH_QSTASH_TOKEN ?? null;
const CHAT_FLUSH_SECRET = process.env.CHAT_FLUSH_SECRET ?? null;

function resolveFlushWebhookUrl() {
  if (process.env.CHAT_FLUSH_WEBHOOK_URL) {
    return process.env.CHAT_FLUSH_WEBHOOK_URL;
  }

  const base =
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL;
  if (!base) return null;

  const normalizedBase = base.startsWith("http")
    ? base.replace(/\/+$/, "")
    : `https://${base.replace(/\/+$/, "")}`;
  return `${normalizedBase}/api/chat/flush`;
}

const CHAT_FLUSH_WEBHOOK_URL = resolveFlushWebhookUrl();

type BufferedChatMessage = {
  id: string;
  roomId: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAt: string;
  clientTimestamp: number;
};

export type BufferedChatMessageRecord = Omit<BufferedChatMessage, "createdAt"> & {
  createdAt: Date;
};

export type ChatBufferStats = {
  flushedMessages: number;
  flushedRooms: number;
};

function roomBufferKey(roomId: string) {
  return `${CHAT_BUFFER_PREFIX}${roomId}`;
}

function toBufferedMessage(input: {
  id: string;
  roomId: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAt: Date;
  clientTimestamp: number;
}): BufferedChatMessage {
  return {
    id: input.id,
    roomId: input.roomId,
    senderUserId: input.senderUserId,
    senderName: input.senderName,
    text: input.text,
    createdAt: input.createdAt.toISOString(),
    clientTimestamp: input.clientTimestamp,
  };
}

function parseBufferedMessage(raw: string): BufferedChatMessage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BufferedChatMessage>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.roomId !== "string" ||
      typeof parsed.senderUserId !== "string" ||
      typeof parsed.senderName !== "string" ||
      typeof parsed.text !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.clientTimestamp !== "number"
    ) {
      return null;
    }
    return parsed as BufferedChatMessage;
  } catch {
    return null;
  }
}

function normalizeBufferedMessages(messages: BufferedChatMessage[]) {
  return Array.from(new Map(messages.map((item) => [item.id, item])).values()).sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

async function scheduleNextFlushWebhook(timestampMs: number) {
  if (!redis) return;
  if (!QSTASH_TOKEN || !CHAT_FLUSH_SECRET || !CHAT_FLUSH_WEBHOOK_URL) return;

  const existingScheduledRaw = await redis.get(CHAT_NEXT_FLUSH_SCHEDULED_AT_KEY);
  const existingScheduled = Number(existingScheduledRaw);
  if (
    Number.isFinite(existingScheduled) &&
    existingScheduled >= timestampMs - 15_000
  ) {
    return;
  }

  const delaySeconds = Math.max(
    5,
    Math.ceil((timestampMs - Date.now()) / 1000),
  );

  try {
    const publishUrl = `${QSTASH_PUBLISH_URL}/${encodeURIComponent(
      CHAT_FLUSH_WEBHOOK_URL,
    )}`;
    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${QSTASH_TOKEN}`,
        "Content-Type": "application/json",
        "Upstash-Delay": `${delaySeconds}s`,
        "Upstash-Forward-x-chat-flush-secret": CHAT_FLUSH_SECRET,
      },
      body: JSON.stringify({
        source: "chat-buffer",
        scheduledFor: timestampMs,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`QStash publish failed (${response.status}): ${body}`);
    }

    await redis.set(CHAT_NEXT_FLUSH_SCHEDULED_AT_KEY, String(timestampMs), {
      ex: Math.max(FLUSH_INTERVAL_SECONDS * 4, 300),
    });
  } catch (error) {
    console.error("[chat-buffer] failed to schedule flush webhook", error);
  }
}

async function queueChatMessage(message: BufferedChatMessage) {
  if (!redis) return;
  const key = roomBufferKey(message.roomId);
  await redis.rpush(key, JSON.stringify(message));
  await redis.sadd(CHAT_DIRTY_ROOMS_KEY, message.roomId);

  const nextFlushRaw = await redis.get(CHAT_NEXT_FLUSH_AT_KEY);
  if (!nextFlushRaw) {
    await setNextFlushTimestamp(Date.now() + FLUSH_INTERVAL_SECONDS * 1000);
  }
}

async function publishRealtimeMessage(message: BufferedChatMessage) {
  if (!realtime) return;

  await realtime.emit("chat.message", {
    id: message.id,
    sender: message.senderUserId,
    displayName: message.senderName,
    text: message.text,
    timestamp: new Date(message.createdAt).getTime(),
    roomId: message.roomId,
  });
}

async function acquireFlushLock() {
  if (!redis) return false;
  const token = crypto.randomUUID();
  const result = await redis.set(CHAT_FLUSH_LOCK_KEY, token, {
    ex: 120,
    nx: true,
  });
  return result === "OK";
}

async function releaseFlushLock() {
  if (!redis) return;
  await redis.del(CHAT_FLUSH_LOCK_KEY);
}

async function setNextFlushTimestamp(timestampMs: number) {
  if (!redis) return;
  await redis.set(CHAT_NEXT_FLUSH_AT_KEY, String(timestampMs));
  await scheduleNextFlushWebhook(timestampMs);
}

export async function flushBufferedChatMessagesOnce(): Promise<ChatBufferStats> {
  if (!redis) return { flushedMessages: 0, flushedRooms: 0 };
  const lockAcquired = await acquireFlushLock();
  if (!lockAcquired) return { flushedMessages: 0, flushedRooms: 0 };

  let flushedRooms = 0;
  let flushedMessages = 0;

  try {
    const dirtyRoomIdsRaw = await redis.smembers(CHAT_DIRTY_ROOMS_KEY);
    const dirtyRoomIds = Array.isArray(dirtyRoomIdsRaw)
      ? dirtyRoomIdsRaw.map((value) => String(value))
      : [];
    for (const roomId of dirtyRoomIds) {
      const bufferKey = roomBufferKey(roomId);
      const rawMessagesRaw = await redis.lrange(bufferKey, 0, -1);
      const rawMessages = Array.isArray(rawMessagesRaw)
        ? rawMessagesRaw.map((value) => String(value))
        : [];
      const parsed = rawMessages
        .map(parseBufferedMessage)
        .filter((item): item is BufferedChatMessage => item !== null);

      if (parsed.length === 0) {
        await redis.del(bufferKey);
        await redis.srem(CHAT_DIRTY_ROOMS_KEY, roomId);
        continue;
      }

      const dedupedById = normalizeBufferedMessages(parsed);

      try {
        for (let i = 0; i < dedupedById.length; i += 200) {
          const chunk = dedupedById.slice(i, i + 200).map((item) => ({
            id: item.id,
            roomId: item.roomId,
            senderUserId: item.senderUserId,
            text: item.text,
            createdAt: new Date(item.createdAt),
            clientTimestamp: item.clientTimestamp,
            deliveryStatus: "SENT" as const,
          }));

          await db
            .insert(chatMessages)
            .values(chunk)
            .onDuplicateKeyUpdate({
              set: {
                id: sql`${chatMessages.id}`,
              },
            });
        }

        const latest = dedupedById[dedupedById.length - 1];
        if (latest) {
          await db
            .update(chatRooms)
            .set({
              lastMessageAt: new Date(latest.createdAt),
            })
            .where(eq(chatRooms.id, roomId));
        }

        await db
          .insert(chatMessageBatches)
          .values({
            id: crypto.randomUUID(),
            roomId,
            batchKey: `${roomId}:${Date.now()}`,
            messageCount: dedupedById.length,
            createdAt: new Date(),
          })
          .onDuplicateKeyUpdate({
            set: {
              messageCount: sql`${chatMessageBatches.messageCount}`,
            },
          });

        await redis.del(bufferKey);
        await redis.srem(CHAT_DIRTY_ROOMS_KEY, roomId);

        flushedRooms += 1;
        flushedMessages += dedupedById.length;
      } catch (error) {
        console.error(
          `[chat-buffer] failed to persist buffered messages for room ${roomId}`,
          error,
        );
      }
    }
  } finally {
    await releaseFlushLock();
  }

  return { flushedMessages, flushedRooms };
}

export async function maybeFlushBufferedChatMessages() {
  if (!redis) return { flushedMessages: 0, flushedRooms: 0 };

  const now = Date.now();
  const nextFlushRaw = await redis.get(CHAT_NEXT_FLUSH_AT_KEY);
  if (!nextFlushRaw) {
    await setNextFlushTimestamp(now + FLUSH_INTERVAL_SECONDS * 1000);
    return { flushedMessages: 0, flushedRooms: 0 };
  }
  const nextFlushAt = Number(nextFlushRaw);
  if (Number.isFinite(nextFlushAt) && nextFlushAt > now) {
    await scheduleNextFlushWebhook(nextFlushAt);
    return { flushedMessages: 0, flushedRooms: 0 };
  }

  const result = await flushBufferedChatMessagesOnce();
  await setNextFlushTimestamp(now + FLUSH_INTERVAL_SECONDS * 1000);
  return result;
}

export async function emitChatRealtimeAndBuffer(input: {
  id: string;
  roomId: string;
  senderUserId: string;
  senderName: string;
  text: string;
  createdAt: Date;
  clientTimestamp: number;
}) {
  const payload = toBufferedMessage(input);

  await Promise.allSettled([
    queueChatMessage(payload),
    publishRealtimeMessage(payload),
    maybeFlushBufferedChatMessages(),
  ]);
}

export async function clearRoomBufferedMessages(roomId: string) {
  if (!redis) return;
  await Promise.all([
    redis.del(roomBufferKey(roomId)),
    redis.srem(CHAT_DIRTY_ROOMS_KEY, roomId),
  ]);
}

async function getNormalizedBufferedMessagesForRoom(roomId: string) {
  if (!redis) return [];
  const rawMessagesRaw = await redis.lrange(roomBufferKey(roomId), 0, -1);
  const rawMessages = Array.isArray(rawMessagesRaw)
    ? rawMessagesRaw.map((value) => String(value))
    : [];
  const parsed = rawMessages
    .map(parseBufferedMessage)
    .filter((item): item is BufferedChatMessage => item !== null);

  return normalizeBufferedMessages(parsed).map((item) => ({
    ...item,
    createdAt: new Date(item.createdAt),
  }));
}

export async function getBufferedChatMessagesForRoom(
  roomId: string,
): Promise<BufferedChatMessageRecord[]> {
  return getNormalizedBufferedMessagesForRoom(roomId);
}

export async function getBufferedChatMessagesByRoomIds(roomIds: string[]) {
  const uniqueRoomIds = Array.from(new Set(roomIds.filter(Boolean)));
  const entries: Array<[string, BufferedChatMessageRecord[]]> = await Promise.all(
    uniqueRoomIds.map(async (roomId) => [
      roomId,
      await getNormalizedBufferedMessagesForRoom(roomId),
    ]),
  );
  return new Map<string, BufferedChatMessageRecord[]>(entries);
}
