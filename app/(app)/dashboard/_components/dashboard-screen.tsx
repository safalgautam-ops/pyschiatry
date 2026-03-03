import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  getDashboardSummary,
  searchUsersForRoleAsActor,
} from "@/lib/dashboard/service";

export async function DashboardScreen() {
  const user = await requireAuthenticatedUser();
  const summary = await getDashboardSummary(user);

  const canManageAssignments =
    user.role === "DOCTOR" || (user.role === "STAFF" && summary.isStaffAdmin);

  const [doctorOptions, patientOptions, staffOptions] = canManageAssignments
    ? await Promise.all([
        searchUsersForRoleAsActor(user, "DOCTOR"),
        searchUsersForRoleAsActor(user, "PATIENT"),
        searchUsersForRoleAsActor(user, "STAFF"),
      ])
    : [[], [], []];

  return (
    <DashboardWorkspace
      doctorOptions={doctorOptions}
      patientOptions={patientOptions}
      staffOptions={staffOptions}
      summary={summary}
      user={user}
    />
  );
}
