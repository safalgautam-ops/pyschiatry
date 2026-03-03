import type { AuthenticatedUser } from "@/lib/auth/session";
import { getPatientChatWorkspaceData } from "@/lib/dashboard/doctor-operations-service";
import { sendPatientMessageAction } from "@/lib/actions/doctor-operations-actions";
import { Button } from "@/components/ui/button";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

type PatientChatWorkspaceProps = {
  user: AuthenticatedUser;
  selectedRoomId?: string | null;
};

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export async function PatientChatWorkspace({
  user,
  selectedRoomId,
}: PatientChatWorkspaceProps) {
  const data = await getPatientChatWorkspaceData(user, selectedRoomId ?? null);
  const selectedRoom =
    data.rooms.find((room) => room.id === data.selectedRoomId) ?? null;

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      <Frame className="grid gap-1 lg:grid-cols-[320px_1fr]">
        <FramePanel className="p-0">
          <div className="border-b px-5 py-4">
            <FrameTitle>Your Doctors</FrameTitle>
            <FrameDescription>
              Chat unlocks after you book an appointment.
            </FrameDescription>
          </div>
          <div className="space-y-1 p-2">
            {data.rooms.map((room) => (
              <Link
                key={room.id}
                href={`/dashboard/patient/chat/${room.id}`}
                className={`block rounded-lg border px-3 py-3 transition-colors hover:bg-muted/40 ${
                  room.id === data.selectedRoomId ? "bg-muted/60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{room.doctorName}</p>
                  <span className="text-muted-foreground text-[11px]">
                    {formatDateTime(room.lastMessageAt)}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {room.latestMessage ?? "No messages yet"}
                </p>
              </Link>
            ))}
            {data.rooms.length === 0 && (
              <p className="text-muted-foreground px-3 py-4 text-sm">
                Book a session first to start chatting with a doctor.
              </p>
            )}
          </div>
        </FramePanel>

        <FramePanel className="flex h-[68vh] flex-col p-0">
          <div className="border-b px-5 py-4">
            <FrameTitle>{selectedRoom?.doctorName ?? "Select Doctor"}</FrameTitle>
            <FrameDescription>
              Direct patient to doctor communication.
            </FrameDescription>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {data.selectedRoomMessages.map((message) => {
              const mine = message.senderUserId === user.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl border px-3 py-2 ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-medium">{message.senderName}</p>
                    <p className="mt-1 text-sm">{message.text}</p>
                    <p className="mt-1 text-[11px] opacity-70">
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            {data.selectedRoomMessages.length === 0 && (
              <p className="text-muted-foreground text-sm">No messages in this chat.</p>
            )}
          </div>
          <form action={sendPatientMessageAction} className="grid gap-2 border-t p-4">
            <input type="hidden" name="roomId" value={data.selectedRoomId ?? ""} />
            <Textarea name="text" placeholder="Type a message..." required />
            <Button size="sm" type="submit" disabled={!data.selectedRoomId}>
              Send Message
            </Button>
          </form>
        </FramePanel>
      </Frame>
    </div>
  );
}
