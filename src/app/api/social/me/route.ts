import { NextResponse } from "next/server";
import { authenticateViewer, updateUsername } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    return NextResponse.json({ user: viewer.user, identity: viewer.identity });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const body = (await request.json()) as { username?: string };
    if (!body.username) return NextResponse.json({ error: "username is required" }, { status: 400 });
    const user = await updateUsername(viewer.user.id, body.username);
    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
