"use client";

import { createAuthClient } from "better-auth/react";

export type AppRole = "PATIENT" | "STAFF" | "DOCTOR";

export const authClient = createAuthClient();
export const useSession = authClient.useSession;

function normalizeRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;
  const normalized = role.toUpperCase();

  if (
    normalized === "PATIENT" ||
    normalized === "STAFF" ||
    normalized === "DOCTOR"
  ) {
    return normalized;
  }

  return null;
}

function readRoleFromUser(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;

  const value = (user as Record<string, unknown>).role;
  return typeof value === "string" ? value : null;
}

function toClientAuthState(
  sessionData: {
    user?: Record<string, unknown> | null;
    session?: unknown;
  } | null,
) {
  const role = normalizeRole(readRoleFromUser(sessionData?.user));
  const isAuthenticated = Boolean(sessionData?.session && sessionData?.user);

  return {
    session: sessionData ?? null,
    user: sessionData?.user ?? null,
    role,
    isAuthenticated,
    isPatient: role === "PATIENT",
    isStaff: role === "STAFF",
    isDoctor: role === "DOCTOR",
  };
}

export function useAuthState() {
  const { data, isPending, isRefetching, error, refetch } = authClient.useSession();
  const state = toClientAuthState(data);

  return {
    ...state,
    isPending,
    isRefetching,
    error,
    refetch,
  };
}

export async function getClientAuthState() {
  const { data } = await authClient.getSession();
  return toClientAuthState(data);
}
