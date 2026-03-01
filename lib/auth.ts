// lib/auth.ts
import { db } from "@/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware, APIError } from "better-auth/api";
import crypto from "node:crypto";

const ALLOWED_SIGNUP_ROLES = new Set(["PATIENT", "STAFF"]); // block DOCTOR public signup

function makeSignature() {
  return crypto.randomBytes(32).toString("hex"); // 64 hex chars
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "mysql" }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    github: { clientId: "", clientSecret: "" },
    google: { clientId: "", clientSecret: "" },
  },
  plugins: [nextCookies()],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Only act on email sign-up endpoint
      if (ctx.path !== "/sign-up/email") return;

      const body = ctx.body as any;

      // 1) Validate role input (or default)
      const role = (body?.role ?? "PATIENT").toUpperCase();
      if (!ALLOWED_SIGNUP_ROLES.has(role)) {
        throw new APIError("BAD_REQUEST", { message: "Invalid role for public signup." });
      }


      // 4) Attach our normalized values into body so DB hooks can rely on them
      return {
        context: {
          ...ctx,
          body: {
            ...body,
            role,
            // If you want one-step key bootstrap (OPTION A):
            // publicKey, encryptedPrivateKey can be included in signup request body
            publicKey: body?.publicKey,
            encryptedPrivateKey: body?.encryptedPrivateKey,
            keyFingerprint: body?.keyFingerprint,
          },
        },
      };
    }),

    after: createAuthMiddleware(async (ctx) => {
      // Runs after endpoint succeeded
      if (!ctx.path.startsWith("/sign-up")) return;

      // Better Auth exposes new session on signup in examples :contentReference[oaicite:2]{index=2}
      const newSession = (ctx.context as any)?.newSession;
      if (!newSession) return;

      // You can do non-critical side effects here (notifications, analytics, etc.)
      // For DB writes that must exist, prefer databaseHooks.user.create.after
    }),
  },

  // Hard guarantees on what gets stored in DB
  databaseHooks: {
    user: {
      create: {
        before: async (u: any) => {
          // This runs right before INSERT into `user` table :contentReference[oaicite:3]{index=3}
          const role = (u.role ?? "PATIENT").toUpperCase();
          const signature = u.signature ?? makeSignature();

          return {
            data: {
              ...u,
              role,
              signature,
              isActive: true,
              // keep `name` already normalized in hooks.before
            },
          };
        },

        after: async (createdUser: any, ctx: any) => {
          // Create role-based profiles after user exists
          // (use your drizzle tables: doctorProfile/patientProfile/staffProfile)
          // Example pseudo:
          //
          // if (createdUser.role === "PATIENT") insert patient_profile
          // if (createdUser.role === "STAFF") insert staff_profile
          //
          // Also: If you choose OPTION A (one-step keys),
          // the signup request included key fields; access original body:
          const body = (ctx as any)?.body as any;

          // OPTION A: store userKeys right after user creation
          if (body?.publicKey && body?.encryptedPrivateKey && body?.keyFingerprint) {
            // Insert into user_keys with keyVersion=1, isActive=true, signature same as user.signature
            // NOTE: implement with your drizzle schema, omitted here for brevity.
          }
        },
      },
    },
  },
});