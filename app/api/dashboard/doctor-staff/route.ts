import { getAuthenticatedUserFromHeaders } from "@/lib/auth/session";
import {
  assignStaffToDoctor,
  updateDoctorStaffStatus,
} from "@/lib/dashboard/service";
import { NextResponse } from "next/server";
import z from "zod";

const assignSchema = z.object({
  doctorUserId: z.string().min(1),
  staffUserId: z.string().min(1),
  staffRole: z.enum(["ADMIN", "RECEPTION"]),
});

const updateSchema = z.object({
  doctorStaffId: z.string().min(1),
  isActive: z.boolean().optional(),
  staffRole: z.enum(["ADMIN", "RECEPTION"]).optional(),
});

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to process request.";
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const input = assignSchema.parse(body);

  try {
    await assignStaffToDoctor(user, input);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: toErrorMessage(error) },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUserFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const input = updateSchema.parse(body);

  try {
    await updateDoctorStaffStatus(user, input);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: toErrorMessage(error) },
      { status: 400 },
    );
  }
}
