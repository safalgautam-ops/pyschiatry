import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DoctorWorkspace } from "../_components/doctor-workspace";

export default async function DoctorSchedulePage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== "DOCTOR") {
    redirect("/dashboard");
  }

  return <DoctorWorkspace user={user} activeTab="schedule" />;
}
