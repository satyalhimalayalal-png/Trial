import { NextResponse } from "next/server";
import { AuthError } from "@/lib/server/googleIdentity";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found")) return NextResponse.json({ error: error.message }, { status: 404 });
    if (message.includes("not visible")) return NextResponse.json({ error: error.message }, { status: 403 });
    if (message.includes("invalid")) return NextResponse.json({ error: error.message }, { status: 400 });
    if (message.includes("already")) return NextResponse.json({ error: error.message }, { status: 409 });
    if (message.includes("cannot")) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown server error" }, { status: 500 });
}
