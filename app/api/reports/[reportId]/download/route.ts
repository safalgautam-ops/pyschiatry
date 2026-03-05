import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromHeaders } from "@/lib/auth/session";
import { downloadReportForUser } from "@/lib/dashboard/doctor-operations-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ reportId: string }> | { reportId: string };
};

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await context.params;
  const reportId = resolvedParams.reportId;
  if (!reportId) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  }

  try {
    const payload = await downloadReportForUser(user, reportId);
    return new NextResponse(payload.bytes, {
      status: 200,
      headers: {
        "Content-Type": payload.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(payload.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to download report.";
    const status =
      message.includes("not found") || message.includes("access")
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
