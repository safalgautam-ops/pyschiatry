import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type AppRole = "DOCTOR" | "PATIENT" | "STAFF";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

function normalizeRole(role: unknown): AppRole | null {
  if (typeof role !== "string") return null;
  const value = role.toUpperCase();
  if (value === "DOCTOR" || value === "PATIENT" || value === "STAFF") {
    return value;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseAuthenticatedUser(session: unknown): AuthenticatedUser | null {
  if (!session || typeof session !== "object") return null;
  const record = session as Record<string, unknown>;
  const user = record.user;
  if (!user || typeof user !== "object") return null;
  const userRecord = user as Record<string, unknown>;

  const id = asString(userRecord.id);
  const name = asString(userRecord.name);
  const email = asString(userRecord.email);
  const role = normalizeRole(userRecord.role);
  if (!id || !name || !email || !role) return null;

  return { id, name, email, role };
}

export async function getAuthenticatedUserFromHeaders(
  requestHeaders: Headers,
): Promise<AuthenticatedUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: requestHeaders,
    });
    return parseAuthenticatedUser(session);
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  return getAuthenticatedUserFromHeaders(await headers());
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
