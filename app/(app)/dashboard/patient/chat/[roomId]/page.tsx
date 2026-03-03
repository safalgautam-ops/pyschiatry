import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PatientChatWorkspace } from "../../_components/patient-chat-workspace";

export default async function PatientChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const user = await requireAuthenticatedUser();
  if (user.role !== "PATIENT") {
    redirect("/dashboard");
  }

  const { roomId } = await params;
  return <PatientChatWorkspace user={user} selectedRoomId={roomId} />;
}
