import { NextResponse } from "next/server";
import { authenticateViewer, listFriends } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const friends = await listFriends(viewer.user.id);
    return NextResponse.json({ friends });
  } catch (error) {
    return jsonError(error);
  }
}
