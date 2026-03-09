import { NextResponse } from "next/server";
import { authenticateViewer, checkUsernameAvailability } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const url = new URL(request.url);
    const username = url.searchParams.get("username") ?? "";
    const result = await checkUsernameAvailability(viewer.user.id, username);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
