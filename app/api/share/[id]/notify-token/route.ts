import { NextResponse } from "next/server";
import {
  isValidShareId,
  registerNotifyToken,
  ShareAuthError,
  ShareConflictError,
} from "@/lib/share";

export const runtime = "nodejs";

type Body = { token?: string; ownerToken?: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isValidShareId(id)) {
      return NextResponse.json({ error: "Invalid bill id." }, { status: 400 });
    }

    const body = (await req.json()) as Body;
    const token = String(body.token ?? "").trim();
    if (!token) {
      return NextResponse.json(
        { error: "Missing `token`." },
        { status: 400 }
      );
    }

    const ok = await registerNotifyToken({
      shareId: id,
      token,
      ownerToken: body.ownerToken,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Bill not found or token rejected." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ShareAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ShareConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to register token.";
    console.error("[/api/share/[id]/notify-token]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
