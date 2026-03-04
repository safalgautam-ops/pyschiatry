import { redirect } from "next/navigation";

import { DoctorStaffManagement } from "../_components/doctor-staff-management";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getDashboardSummary } from "@/lib/dashboard/service";

export default async function DoctorStaffPage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== "DOCTOR") {
    redirect("/dashboard");
  }

  const summary = await getDashboardSummary(user);

  return (
    <DoctorStaffManagement
      staff={summary.tenantStaff.map((item) => ({
        id: item.id,
        staffUserId: item.staffUserId,
        staffName: item.staffName,
        staffEmail: item.staffEmail,
        staffPhone: item.staffPhone,
        username: item.username,
        staffRole: item.staffRole,
        isActive: item.isActive,
        createdAt: item.createdAt,
      }))}
    />
  );
}
