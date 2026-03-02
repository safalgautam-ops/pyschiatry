import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PatientChatWorkspace } from "../_components/patient-chat-workspace";

export default async function PatientChatPage() {
  const user = await requireAuthenticatedUser();
  if (user.role !== "PATIENT") {
    redirect("/dashboard");
  }

  return <PatientChatWorkspace user={user} />;
}
