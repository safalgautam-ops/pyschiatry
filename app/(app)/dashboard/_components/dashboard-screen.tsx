import { StaffOnboardingScreen } from "../staff/_components/staff-onboarding-screen";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  getDashboardSummary,
  getStaffOnboardingStatus,
} from "@/lib/dashboard/service";

export async function DashboardScreen() {
  const user = await requireAuthenticatedUser();
  if (user.role === "STAFF") {
    const onboarding = await getStaffOnboardingStatus(user);
    if (onboarding.required && onboarding.profile) {
      return <StaffOnboardingScreen profile={onboarding.profile} />;
    }
  }

  const summary = await getDashboardSummary(user);

  return <DashboardWorkspace summary={summary} user={user} />;
}
