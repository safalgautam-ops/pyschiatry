"use server";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  assignStaffToDoctor,
  completeStaffOnboardingProfile,
  createStaffAccountForDoctor,
  getDashboardSummary,
  getStaffOnboardingStatus,
  linkPatientToDoctor,
  searchUsersForRoleAsActor,
  updateDoctorPatientStatus,
  updateDoctorStaffStatus,
} from "@/lib/dashboard/service";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
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

export async function createStaffAccountAction(input: {
  name: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  staffRole: "ADMIN" | "RECEPTION";
  jobTitle?: string;
  address?: string;
  notes?: string;
}) {
  const user = await requireAuthenticatedUser();
  try {
    await createStaffAccountForDoctor(user, input);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/doctor/staff");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: toErrorMessage(error) };
  }
}

export async function getStaffOnboardingStatusAction() {
  const user = await requireAuthenticatedUser();
  return getStaffOnboardingStatus(user);
}

export async function completeStaffOnboardingAction(input: {
  currentPassword: string;
  newPassword: string;
  name: string;
  phone: string;
  username: string;
  jobTitle?: string;
  address?: string;
  notes?: string;
}) {
  const user = await requireAuthenticatedUser();

  try {
    if (user.role !== "STAFF") {
      throw new Error("Only staff users can complete onboarding.");
    }

    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
    });

    await completeStaffOnboardingProfile(user, {
      name: input.name,
      phone: input.phone,
      username: input.username,
      jobTitle: input.jobTitle,
      address: input.address,
      notes: input.notes,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/staff");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: toErrorMessage(error) };
  }
}
