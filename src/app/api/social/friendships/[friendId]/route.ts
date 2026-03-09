import { NextResponse } from "next/server";
import { authenticateViewer, removeFriend } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ friendId: string }> },
) {
  try {
    const viewer = await authenticateViewer(request);
    const { friendId } = await context.params;
    const removed = await removeFriend(viewer.user.id, friendId);
    return NextResponse.json({ removed });
  } catch (error) {
    return jsonError(error);
  }
}
