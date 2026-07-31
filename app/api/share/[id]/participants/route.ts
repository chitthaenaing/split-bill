import { NextResponse } from "next/server";
import { toPublicStoredBill } from "@/lib/public-bill";
import {
  isValidShareId,
  setShareParticipants,
  ShareConflictError,
} from "@/lib/share";

export const runtime = "nodejs";

type Body = { participants?: unknown };

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!isValidShareId(id)) {
      return NextResponse.json({ error: "Invalid bill id." }, { status: 400 });
    }

    const body = (await req.json()) as Body;
    const updated = await setShareParticipants({
      shareId: id,
      participants: body.participants,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Bill not found or sharing is not configured." },
        { status: 404 }
      );
    }

    const pub = toPublicStoredBill(updated);
    return NextResponse.json({
      ok: true,
      participants: pub.participants ?? [],
    });
  } catch (err) {
    if (err instanceof ShareConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message =
      err instanceof Error
        ? err.message
        : "Failed to update who is included on this bill.";
    console.error("[/api/share/[id]/participants]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
