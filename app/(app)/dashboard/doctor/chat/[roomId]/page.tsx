import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DoctorWorkspace } from "../../_components/doctor-workspace";

export default async function DoctorChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const user = await requireAuthenticatedUser();
  if (user.role !== "DOCTOR") {
    redirect("/dashboard");
  }

  const { roomId } = await params;
  return <DoctorWorkspace user={user} activeTab="chat" selectedRoomId={roomId} />;
}
