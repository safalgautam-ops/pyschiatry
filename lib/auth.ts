// lib/auth.ts
import { db } from "@/db";
import { userKeys } from "@/drizzle/crypto";
import { sendAuthOtpEmail } from "@/lib/mailer";
import {
  patientProfile,
  staffProfile,
} from "@/drizzle/profiles";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { createAuthMiddleware, APIError } from "better-auth/api";
import crypto from "node:crypto";

const ALLOWED_SIGNUP_ROLES = new Set(["PATIENT", "STAFF"]);
const DEFAULT_STAFF_ROLE = "ADMIN";
const EMAIL_OTP_EXPIRES_IN_SECONDS = 5 * 60;
const AUTH_RATE_LIMIT_WINDOW_SECONDS = 60;
const AUTH_RATE_LIMIT_MAX_REQUESTS = 100;

const socialProviders = {
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }
    : {}),
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
};

type SignupBody = {
  role?: string;
  phone?: string;
};

type CreatedUser = {
  id: string;
  role: string;
  signature: string;
};

function asObjectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseSignupBody(value: unknown): SignupBody {
  const raw = asObjectRecord(value);
  return {
    role: asOptionalString(raw.role),
    phone: asOptionalString(raw.phone),
  };
}

function makeSignature() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeRole(role: string) {
  return role.trim().toUpperCase();
}

function getUserKeyEncryptionSecret() {
  const secret =
    process.env.USER_KEYS_ENCRYPTION_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    process.env.AUTH_SECRET;
  if (secret) return secret;

  console.warn(
    "[auth] Missing USER_KEYS_ENCRYPTION_SECRET/BETTER_AUTH_SECRET/AUTH_SECRET. Using development fallback for user key encryption.",
  );
  return "development-only-user-key-secret";
}

function fingerprintPublicKey(publicKeyPem: string) {
  return crypto.createHash("sha256").update(publicKeyPem).digest("hex");
}

function encryptPrivateKeyForStorage(privateKeyPem: string, signature: string) {
  const encryptionSecret = getUserKeyEncryptionSecret();
  const key = crypto
    .createHash("sha256")
    .update(`${encryptionSecret}:${signature}`)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKeyPem, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  });
}

async function generateEd25519PemKeyPair() {
  return await new Promise<{ publicKey: string; privateKey: string }>(
    (resolve, reject) => {
      crypto.generateKeyPair(
        "ed25519",
        {
          publicKeyEncoding: { format: "pem", type: "spki" },
          privateKeyEncoding: { format: "pem", type: "pkcs8" },
        },
        (error, publicKey, privateKey) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ publicKey, privateKey });
        },
      );
    },
  );
}

async function createInitialUserKey(user: Pick<CreatedUser, "id" | "signature">) {
  const keyPair = await generateEd25519PemKeyPair();
  const encryptedPrivateKey = encryptPrivateKeyForStorage(
    keyPair.privateKey,
    user.signature,
  );
  const keyFingerprint = fingerprintPublicKey(keyPair.publicKey);

  await db
    .insert(userKeys)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      keyVersion: 1,
      publicKey: keyPair.publicKey,
      encryptedPrivateKey,
      keyFingerprint,
      signature: user.signature,
      isActive: true,
    })
    .onDuplicateKeyUpdate({
      set: { userId: user.id },
    });
}

async function bootstrapUserData(user: CreatedUser) {
  if (user.role === "PATIENT") {
    await db
      .insert(patientProfile)
      .values({ id: crypto.randomUUID(), userId: user.id })
      .onDuplicateKeyUpdate({ set: { userId: user.id } });
    return;
  }

  if (user.role === "STAFF") {
    await db
      .insert(staffProfile)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        staffRole: DEFAULT_STAFF_ROLE,
      })
      .onDuplicateKeyUpdate({ set: { staffRole: DEFAULT_STAFF_ROLE } });
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "mysql" }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "PATIENT",
      },
      phone: {
        type: "string",
        required: false,
      },
      signature: {
        type: "string",
        input: false,
        required: true,
        returned: false,
        defaultValue: () => makeSignature(),
      },
      isActive: {
        type: "boolean",
        input: false,
        required: false,
        defaultValue: true,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
  },
  rateLimit: {
    enabled: true,
    window: AUTH_RATE_LIMIT_WINDOW_SECONDS,
    max: AUTH_RATE_LIMIT_MAX_REQUESTS,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/email-otp/send-verification-otp": { window: 60, max: 5 },
      "/email-otp/request-password-reset": { window: 60, max: 3 },
      "/email-otp/reset-password": { window: 60, max: 5 },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_OTP_EXPIRES_IN_SECONDS,
  },
  socialProviders,
  plugins: [
    nextCookies(),
    emailOTP({
      expiresIn: EMAIL_OTP_EXPIRES_IN_SECONDS,
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendAuthOtpEmail({
          email,
          otp,
          type,
          expiresInSeconds: EMAIL_OTP_EXPIRES_IN_SECONDS,
        });
      },
    }),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const rawBody = asObjectRecord(ctx.body);
      const body = parseSignupBody(rawBody);
      const role = normalizeRole(body.role ?? "PATIENT");
      if (!ALLOWED_SIGNUP_ROLES.has(role)) {
        throw new APIError("BAD_REQUEST", {
          message: "Invalid role for public signup.",
        });
      }

      const phone = body.phone?.trim();
      if (phone && phone.length > 32) {
        throw new APIError("BAD_REQUEST", { message: "phone is too long." });
      }

      return {
        context: {
          ...ctx,
          body: {
            ...rawBody,
            role,
            phone: phone ?? null,
          },
        },
      };
    }),

    after: createAuthMiddleware(async (ctx) => {
      // Runs after endpoint succeeded
      if (!ctx.path.startsWith("/sign-up")) return;

      // Better Auth exposes new session on signup in examples :contentReference[oaicite:2]{index=2}
      const contextRecord = asObjectRecord(ctx.context);
      const newSession = contextRecord.newSession;
      if (!newSession) return;

      // You can do non-critical side effects here (notifications, analytics, etc.)
      // For DB writes that must exist, prefer databaseHooks.user.create.after
    }),
  },

  // Hard guarantees on what gets stored in DB
  databaseHooks: {
    user: {
      create: {
        before: async (u: unknown) => {
          // This runs right before INSERT into `user` table :contentReference[oaicite:3]{index=3}
          const userData = asObjectRecord(u);
          const role = normalizeRole(asOptionalString(userData.role) ?? "PATIENT");
          if (!ALLOWED_SIGNUP_ROLES.has(role)) {
            throw new APIError("BAD_REQUEST", {
              message: "Doctor accounts cannot be created from API signup.",
            });
          }
          const signature =
            asOptionalString(userData.signature) ?? makeSignature();

          return {
            data: {
              ...userData,
              role,
              signature,
              isActive: true,
              // keep `name` already normalized in hooks.before
            },
          };
        },

        after: async (createdUserRaw: unknown) => {
          const createdUser = asObjectRecord(createdUserRaw);
          const userId = asOptionalString(createdUser.id);
          if (!userId) return;

          const role = normalizeRole(asOptionalString(createdUser.role) ?? "PATIENT");
          const signature = asOptionalString(createdUser.signature);
          if (!signature) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Missing user signature after user creation.",
            });
          }

          await Promise.all([
            bootstrapUserData({ id: userId, role, signature }),
            createInitialUserKey({ id: userId, signature }),
          ]);
        },
      },
    },
  },
});
