import { getAuthenticatedUserFromHeaders } from "@/lib/auth/session";
import { searchUsersForRoleAsActor } from "@/lib/dashboard/service";
import { NextResponse } from "next/server";
import z from "zod";

const querySchema = z.object({
  role: z.enum(["DOCTOR", "PATIENT", "STAFF"]),
  q: z.string().optional(),
});

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = querySchema.parse({
    role: url.searchParams.get("role"),
    q: url.searchParams.get("q") ?? undefined,
  });

  try {
    const users = await searchUsersForRoleAsActor(user, query.role, query.q);
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Forbidden user directory query.",
      },
      { status: 403 },
    );
  }
}
