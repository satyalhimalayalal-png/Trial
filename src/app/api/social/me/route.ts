import { NextResponse } from "next/server";
import { authenticateViewer } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    return NextResponse.json({ user: viewer.user, identity: viewer.identity });
  } catch (error) {
    return jsonError(error);
  }
}
