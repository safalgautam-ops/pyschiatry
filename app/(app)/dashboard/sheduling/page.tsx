import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function SchedulingAliasPage() {
  const user = await requireAuthenticatedUser();

  if (user.role === "DOCTOR") {
    redirect("/dashboard/doctor/schedule");
  }

  redirect("/dashboard");
}
