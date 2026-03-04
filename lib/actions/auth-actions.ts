"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { doctorPatients, user } from "@/drizzle";
import {
  sendMailSafely,
  sendPasswordResetRequestedEmailToDoctor,
  sendPasswordResetRequestedEmailToUser,
  sendPasswordResetSuccessfulEmail,
} from "@/lib/mailer";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown authentication error";
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
