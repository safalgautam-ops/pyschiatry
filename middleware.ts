import { NextRequest, NextResponse } from "next/server";

// Routes that require authentication
const protectedPaths = ["/dashboard"];

// Routes only accessible when NOT authenticated
const authPaths = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // better-auth sets this cookie on successful sign-in
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value;

  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path),
  );
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  // Unauthenticated user trying to access a protected page → send to login
  if (isProtectedPath && !sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user visiting login/signup → send to dashboard
  if (isAuthPath && sessionToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except static files and API
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
