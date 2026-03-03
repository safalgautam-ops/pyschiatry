import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function DashboardDoctorPage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== "DOCTOR") {
    redirect("/dashboard");
  }

  redirect("/dashboard");
}
