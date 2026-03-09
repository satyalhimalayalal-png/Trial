import { NextResponse } from "next/server";
import { authenticateViewer, searchUsersByUsername } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? "8");
    const results = await searchUsersByUsername(viewer.user.id, query, Number.isFinite(limit) ? limit : 8);
    return NextResponse.json({ results });
  } catch (error) {
    return jsonError(error);
  }
}
