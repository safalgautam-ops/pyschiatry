"use server";

import { auth } from "@/lib/auth";
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
    await auth.api.requestPasswordResetEmailOTP({
      body: { email },
    });
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
    await auth.api.resetPasswordEmailOTP({
      body: {
        email,
        otp,
        password,
      },
    });
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
