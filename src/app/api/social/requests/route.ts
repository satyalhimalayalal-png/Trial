import { NextResponse } from "next/server";
import {
  acceptFriendRequest,
  authenticateViewer,
  cancelFriendRequest,
  declineFriendRequest,
  listPendingRequests,
  sendFriendRequest,
} from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const pending = await listPendingRequests(viewer.user.id);
    return NextResponse.json(pending);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const body = (await request.json()) as
      | { action: "send"; recipientEmail: string }
      | { action: "accept"; requestId: number }
      | { action: "decline"; requestId: number }
      | { action: "cancel"; requestId: number };

    if (body.action === "send") {
      const result = await sendFriendRequest(viewer.user.id, body.recipientEmail);
      return NextResponse.json(result);
    }
    if (body.action === "accept") {
      const requestRow = await acceptFriendRequest(viewer.user.id, body.requestId);
      return NextResponse.json({ request: requestRow });
    }
    if (body.action === "decline") {
      const requestRow = await declineFriendRequest(viewer.user.id, body.requestId);
      return NextResponse.json({ request: requestRow });
    }
    if (body.action === "cancel") {
      const requestRow = await cancelFriendRequest(viewer.user.id, body.requestId);
      return NextResponse.json({ request: requestRow });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
