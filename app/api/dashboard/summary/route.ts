import { getAuthenticatedUserFromHeaders } from "@/lib/auth/session";
import { getDashboardSummary } from "@/lib/dashboard/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const summary = await getDashboardSummary(user);
  return NextResponse.json(summary);
}
