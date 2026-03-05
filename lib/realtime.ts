import { InferRealtimeEvents, Realtime } from "@upstash/realtime";
import z from "zod";

import { redis } from "@/lib/redis";

const message = z.object({
  id: z.string(),
  sender: z.string(),
  displayName: z.string(),
  text: z.string(),
  timestamp: z.number(),
  roomId: z.string(),
  token: z.string().optional(),
});

const presence = z.object({
  displayName: z.string().optional(),
  username: z.string().optional(),
  avatar: z.string().url().optional(),
});

const schema = {
  chat: {
    message,
    join: presence,
    leave: z.object({}).optional(),
    destroy: z.object({
      isDestroyed: z.literal(true),
    }),
  },
};

export const realtime = redis ? new Realtime({ schema, redis }) : null;
export type RealtimeEvents = InferRealtimeEvents<NonNullable<typeof realtime>>;

export type RealtimeMessage = z.infer<typeof message>;
