import { handle } from "@upstash/realtime";
import { NextResponse } from "next/server";

import { realtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export const GET = realtime
  ? handle({ realtime })
  : async () =>
      NextResponse.json(
        { error: "Realtime is not configured in this environment." },
        { status: 503 },
      );
