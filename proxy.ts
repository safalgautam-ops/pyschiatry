import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

type AppRole = "PATIENT" | "STAFF" | "DOCTOR";
type SessionState = {
  isAuthenticated: boolean;
  role: AppRole | null;
};

const AUTH_ONLY_ROUTES = ["/login", "/signup", "/forgot-password"];
const PROTECTED_PREFIXES = ["/dashboard"];

// Role-specific route segments. Keep these aligned with app route design.
const ROLE_PREFIXES: Record<AppRole, string[]> = {
  PATIENT: ["/dashboard/patient"],
  STAFF: ["/dashboard/staff"],
  DOCTOR: ["/dashboard/doctor"],
};

const DEFAULT_AUTH_REDIRECT = "/dashboard";

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function matchesAnyRoute(pathname: string, routes: string[]) {
  return routes.some((route) => matchesRoute(pathname, route));
}

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

function toSessionState(session: unknown): SessionState {
  if (!session || typeof session !== "object") {
    return { isAuthenticated: false, role: null };
  }

  const sessionRecord = session as Record<string, unknown>;
  const sessionData = sessionRecord.session;
  const userData = sessionRecord.user;
  const isAuthenticated = Boolean(
    sessionData && typeof sessionData === "object" && userData && typeof userData === "object",
  );

  let role: AppRole | null = null;
  if (userData && typeof userData === "object") {
    const rawRole = (userData as Record<string, unknown>).role;
    role = normalizeRole(typeof rawRole === "string" ? rawRole : null);
  }

  return { isAuthenticated, role };
}

async function getSessionState(request: NextRequest): Promise<SessionState> {
  // Skip auth API lookup when there is no session cookie at all.
  const cookie = request.headers.get("cookie");
  if (!cookie) return { isAuthenticated: false, role: null };

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return toSessionState(session);
  } catch {
    return { isAuthenticated: false, role: null };
  }
}

function routeRequiresRole(pathname: string): AppRole | null {
  if (matchesAnyRoute(pathname, ROLE_PREFIXES.DOCTOR)) return "DOCTOR";
  if (matchesAnyRoute(pathname, ROLE_PREFIXES.STAFF)) return "STAFF";
  if (matchesAnyRoute(pathname, ROLE_PREFIXES.PATIENT)) return "PATIENT";
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthOnlyRoute = matchesAnyRoute(pathname, AUTH_ONLY_ROUTES);
  const isProtectedRoute = matchesAnyRoute(pathname, PROTECTED_PREFIXES);

  if (!isAuthOnlyRoute && !isProtectedRoute) {
    return NextResponse.next();
  }

  const { isAuthenticated, role } = await getSessionState(request);

  if (!isAuthenticated && isProtectedRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isAuthOnlyRoute) {
    return NextResponse.redirect(new URL(DEFAULT_AUTH_REDIRECT, request.url));
  }

  const requiredRole = routeRequiresRole(pathname);
  if (requiredRole && role !== requiredRole) {
    return NextResponse.redirect(new URL(DEFAULT_AUTH_REDIRECT, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
