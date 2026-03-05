import { NextRequest, NextResponse } from "next/server";

import { maybeFlushBufferedChatMessages } from "@/lib/chat-buffer";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.CHAT_FLUSH_SECRET;
  if (!configuredSecret) {
    return false;
  }
  const providedSecret = request.headers.get("x-chat-flush-secret");
  return providedSecret === configuredSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await maybeFlushBufferedChatMessages();
  return NextResponse.json({
    ok: true,
    ...result,
  });
}
