import { NextResponse } from "next/server";
import { authenticateViewer, getProfileForViewer } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const viewer = await authenticateViewer(request);
    const { userId } = await context.params;
    const profile = await getProfileForViewer(viewer.user.id, userId);
    return NextResponse.json(profile);
  } catch (error) {
    return jsonError(error);
  }
}
