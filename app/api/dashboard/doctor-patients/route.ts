import { getAuthenticatedUserFromHeaders } from "@/lib/auth/session";
import {
  linkPatientToDoctor,
  updateDoctorPatientStatus,
} from "@/lib/dashboard/service";
import { NextResponse } from "next/server";
import z from "zod";

const linkSchema = z.object({
  doctorUserId: z.string().min(1),
  patientUserId: z.string().min(1),
});

const statusSchema = z.object({
  doctorPatientId: z.string().min(1),
  status: z.enum(["ACTIVE", "BLOCKED", "ARCHIVED"]),
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
  const input = linkSchema.parse(body);

  try {
    await linkPatientToDoctor(user, input);
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
  const input = statusSchema.parse(body);

  try {
    await updateDoctorPatientStatus(user, input);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: toErrorMessage(error) },
      { status: 400 },
    );
  }
}
