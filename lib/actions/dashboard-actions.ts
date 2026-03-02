"use server";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  assignStaffToDoctor,
  getDashboardSummary,
  linkPatientToDoctor,
  searchUsersForRoleAsActor,
  updateDoctorPatientStatus,
  updateDoctorStaffStatus,
} from "@/lib/dashboard/service";
import { revalidatePath } from "next/cache";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected dashboard error.";
}

export async function getDashboardSummaryAction() {
  const user = await requireAuthenticatedUser();
  return getDashboardSummary(user);
}

export async function searchUsersByRoleAction(
  role: "DOCTOR" | "PATIENT" | "STAFF",
  query?: string,
) {
  const user = await requireAuthenticatedUser();
  return searchUsersForRoleAsActor(user, role, query);
}

export async function linkPatientToDoctorAction(input: {
  doctorUserId: string;
  patientUserId: string;
}) {
  const user = await requireAuthenticatedUser();
  try {
    await linkPatientToDoctor(user, input);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: toErrorMessage(error) };
  }
}

export async function assignStaffToDoctorAction(input: {
  doctorUserId: string;
  staffUserId: string;
  staffRole: "ADMIN" | "RECEPTION";
}) {
  const user = await requireAuthenticatedUser();
  try {
    await assignStaffToDoctor(user, input);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: toErrorMessage(error) };
  }
}

export async function setDoctorPatientStatusAction(input: {
  doctorPatientId: string;
  status: "ACTIVE" | "BLOCKED" | "ARCHIVED";
}) {
  const user = await requireAuthenticatedUser();
  try {
    await updateDoctorPatientStatus(user, input);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: toErrorMessage(error) };
  }
}

export async function setDoctorStaffStatusAction(input: {
  doctorStaffId: string;
  isActive?: boolean;
  staffRole?: "ADMIN" | "RECEPTION";
}) {
  const user = await requireAuthenticatedUser();
  try {
    await updateDoctorStaffStatus(user, input);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: toErrorMessage(error) };
  }
}
