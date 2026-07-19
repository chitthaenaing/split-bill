import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth-request";
import { summarizeStoredBill } from "@/lib/bill-summary";
import { isValidShareId } from "@/lib/normalize-stored-bill";
import { getShare } from "@/lib/share";
import {
  listUserBillLinks,
  recordUserBillLink,
  type UserBillRole,
} from "@/lib/user-bills";

export const runtime = "nodejs";

function httpStatusFromError(err: unknown, fallback: number): number {
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status: unknown }).status);
    if (Number.isFinite(status) && status >= 400 && status < 600) return status;
  }
  return fallback;
}

export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req);
    const bills = await listUserBillLinks(user.uid);
    return NextResponse.json(bills);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load your bills.";
    const status = httpStatusFromError(err, 500);
    if (status >= 500) console.error("[/api/me/bills GET]", err);
    return NextResponse.json({ error: message }, { status });
  }
}

type PostBody = {
  shareId?: string;
  role?: UserBillRole;
};

/**
 * Record (or refresh) a share in the signed-in user's index.
 * Used when opening a received link; create-share also records via /api/share.
 */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    const body = (await req.json()) as PostBody;
    const shareId = String(body.shareId ?? "").trim();
    const role = body.role === "shared" ? "shared" : "received";

    if (!isValidShareId(shareId)) {
      return NextResponse.json({ error: "Invalid share id." }, { status: 400 });
    }

    // Prefer live bill metadata so the account list stays accurate.
    const bill = await getShare(shareId);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found." }, { status: 404 });
    }

    const link = await recordUserBillLink({
      uid: user.uid,
      shareId,
      role,
      summary: summarizeStoredBill(bill),
    });

    if (!link) {
      return NextResponse.json(
        {
          error:
            "Accounts aren't configured on the server (missing Firebase Admin credentials or Firestore).",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ link });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save this bill to your account.";
    const status = httpStatusFromError(err, 500);
    if (status >= 500) console.error("[/api/me/bills POST]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
