"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { doctorPatients, user, userKeys } from "@/drizzle";
import { createReportAccessRecoveryRequestsForPatient } from "@/lib/dashboard/doctor-operations-service";
import {
  sendMailSafely,
  sendPasswordResetRequestedEmailToDoctor,
  sendPasswordResetRequestedEmailToUser,
  sendPasswordResetSuccessfulEmail,
} from "@/lib/mailer";
import { and, desc, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown authentication error";
}

function getUserKeyEncryptionSecret() {
  return (
    process.env.USER_KEYS_ENCRYPTION_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    process.env.AUTH_SECRET ??
    "development-only-user-key-secret"
  );
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

function fingerprintPublicKey(publicKeyPem: string) {
  return crypto.createHash("sha256").update(publicKeyPem).digest("hex");
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

async function rotateUserKeysAfterPasswordReset(input: {
  userId: string;
  signature: string;
}) {
  const [latestKey] = await db
    .select({
      keyVersion: userKeys.keyVersion,
    })
    .from(userKeys)
    .where(eq(userKeys.userId, input.userId))
    .orderBy(desc(userKeys.keyVersion))
    .limit(1);

  const nextKeyVersion = (latestKey?.keyVersion ?? 0) + 1;
  const pair = await generateEd25519PemKeyPair();
  const encryptedPrivateKey = encryptPrivateKeyForStorage(
    pair.privateKey,
    input.signature,
  );
  const keyFingerprint = fingerprintPublicKey(pair.publicKey);

  await db.transaction(async (tx) => {
    await tx
      .update(userKeys)
      .set({ isActive: false })
      .where(eq(userKeys.userId, input.userId));

    await tx.insert(userKeys).values({
      id: crypto.randomUUID(),
      userId: input.userId,
      keyVersion: nextKeyVersion,
      publicKey: pair.publicKey,
      encryptedPrivateKey,
      keyFingerprint,
      signature: input.signature,
      isActive: true,
    });
  });
}

export const signUp = async (email: string, password: string, name: string) => {
  try {
    return await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        callbackURL: "/dashboard",
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const data = await auth.api.signInEmail({
      body: {
        email,
        password,
        callbackURL: "/dashboard",
      },
    });
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, message: toErrorMessage(error) };
  }
};

export const sendVerificationOtp = async (email: string) => {
  try {
    await auth.api.sendVerificationOTP({
      body: {
        email,
        type: "email-verification",
      },
    });
    return { success: true };
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
};

export const verifyEmailOtp = async (email: string, otp: string) => {
  try {
    const result = await auth.api.verifyEmailOTP({
      body: {
        email,
        otp,
      },
    });
    return {
      success: result.status === true,
      token: result.token,
    };
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
};

export const requestPasswordResetOtp = async (email: string) => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    await auth.api.requestPasswordResetEmailOTP({
      body: { email: normalizedEmail },
    });

    const [requestedUser] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (requestedUser) {
      await sendMailSafely("send password reset requested email to user", () =>
        sendPasswordResetRequestedEmailToUser({
          email: requestedUser.email,
          name: requestedUser.name,
        }),
      );

      if (requestedUser.role === "PATIENT") {
        const doctorLinks = await db
          .select({
            doctorUserId: doctorPatients.doctorUserId,
          })
          .from(doctorPatients)
          .where(
            and(
              eq(doctorPatients.patientUserId, requestedUser.id),
              eq(doctorPatients.status, "ACTIVE"),
            ),
          );

        const doctorIds = doctorLinks.map((row) => row.doctorUserId);
        const doctors =
          doctorIds.length > 0
            ? await db
                .select({
                  doctorEmail: user.email,
                  doctorName: user.name,
                })
                .from(user)
                .where(inArray(user.id, doctorIds))
            : [];

        for (const doctor of doctors) {
          await sendMailSafely(
            `send password reset request alert to doctor ${doctor.doctorEmail}`,
            () =>
              sendPasswordResetRequestedEmailToDoctor({
                doctorEmail: doctor.doctorEmail,
                doctorName: doctor.doctorName,
                patientName: requestedUser.name,
                patientEmail: requestedUser.email,
              }),
          );
        }
      }
    }

    return { success: true };
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
};

export const resetPasswordWithOtp = async (
  email: string,
  otp: string,
  password: string,
) => {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    await auth.api.resetPasswordEmailOTP({
      body: {
        email: normalizedEmail,
        otp,
        password,
      },
    });

    const [updatedUser] = await db
      .select({
        id: user.id,
        role: user.role,
        signature: user.signature,
        email: user.email,
        name: user.name,
      })
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (updatedUser) {
      await sendMailSafely("send password reset successful email", () =>
        sendPasswordResetSuccessfulEmail({
          email: updatedUser.email,
          name: updatedUser.name,
        }),
      );

      try {
        await rotateUserKeysAfterPasswordReset({
          userId: updatedUser.id,
          signature: updatedUser.signature,
        });

        if (updatedUser.role === "PATIENT") {
          await createReportAccessRecoveryRequestsForPatient(updatedUser.id);
        }
      } catch (rekeyError) {
        console.error("[auth] post-reset key rotation/recovery setup failed", rekeyError);
      }
    }

    return { success: true };
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
};

export const signOut = async () => {
  await auth.api.signOut({ headers: await headers() });
};

export const revokeOtherSessions = async () => {
  try {
    await auth.api.revokeOtherSessions({
      headers: await headers(),
    });
    return { success: true };
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
};

export const signInWithSocial = async (provider: "google") => {
  const { url } = await auth.api.signInSocial({
    body: {
      provider,
      callbackURL: "/dashboard",
    },
  });

  if (url) {
    redirect(url);
  }
};
