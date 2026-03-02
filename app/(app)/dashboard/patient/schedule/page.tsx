import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPatientScheduleData } from "@/lib/dashboard/doctor-operations-service";
import { PatientScheduleManager } from "@/components/sheduling";
import { redirect } from "next/navigation";

export default async function PatientSchedulePage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== "PATIENT") {
    redirect("/dashboard");
  }

  const data = await getPatientScheduleData(user);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PatientScheduleManager data={data} />
    </div>
  );
}
