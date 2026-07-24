/**
 * Import / refresh photo fixtures from Vercel Blob shares.
 *
 * Usage:
 *   npx tsx scripts/import-photo-fixtures-from-blob.ts
 *   npx tsx scripts/import-photo-fixtures-from-blob.ts --share-ids TgBHtkvDzE,UiAJOpWQsq
 *   BLOB_READ_WRITE_TOKEN=… npx tsx scripts/import-photo-fixtures-from-blob.ts --list-all
 *
 * Without --list-all, refreshes receiptUrl for known fixtures and optionally
 * creates drafts for --share-ids. Gold is never overwritten when goldCorrected
 * is true (unless --force-gold).
 *
 * Blob bill.json is often missing subtotal/total and may store a wrong extract —
 * review new drafts before locking them.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { list } from "@vercel/blob";
import {
  inferTotalsFromCharges,
  type PhotoFixture,
  type PhotoGold,
} from "../lib/photo-scoreboard";
import { normalizeExtractedBill, checkBillMath } from "../lib/bill-extract";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "photos");
const DEFAULT_STORE =
  process.env.BLOB_PUBLIC_HOST ||
  "https://tw40ymrijg2fraib.public.blob.vercel-storage.com";

function parseArgs(argv: string[]) {
  const out = {
    listAll: false,
    forceGold: false,
    shareIds: [] as string[],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list-all") out.listAll = true;
    else if (a === "--force-gold") out.forceGold = true;
    else if (a === "--share-ids") {
      const v = argv[++i] || "";
      out.shareIds = v.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return out;
}

function loadExisting(): Map<string, PhotoFixture> {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const map = new Map<string, PhotoFixture>();
  for (const f of readdirSync(FIXTURES_DIR)) {
    if (!f.endsWith(".json")) continue;
    const fixture = JSON.parse(
      readFileSync(join(FIXTURES_DIR, f), "utf8")
    ) as PhotoFixture;
    if (fixture.shareId) map.set(fixture.shareId, fixture);
    map.set(fixture.id, fixture);
  }
  return map;
}

async function fetchBillJson(shareId: string): Promise<Record<string, unknown>> {
  const url = `${DEFAULT_STORE}/bills/${shareId}/bill.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`bill.json ${shareId}: HTTP ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function billToDraftGold(bill: Record<string, unknown>): PhotoGold {
  const items = Array.isArray(bill.items)
    ? bill.items.map((raw) => {
        const it = raw as Record<string, unknown>;
        return {
          name: String(it.name ?? ""),
          ...(typeof it.nameTranslated === "string" && it.nameTranslated
            ? { nameTranslated: it.nameTranslated }
            : {}),
          price: Number(it.price) || 0,
          quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
        };
      })
    : [];
  const tax = Math.max(0, Number(bill.tax) || 0);
  const serviceCharge = Math.max(0, Number(bill.serviceCharge) || 0);
  const rounding = Number(bill.rounding) || 0;
  const additionalCharges = Array.isArray(bill.additionalCharges)
    ? bill.additionalCharges
        .map((raw) => {
          const c = raw as Record<string, unknown>;
          return {
            name: String(c.name ?? ""),
            amount: Math.max(0, Number(c.amount) || 0),
          };
        })
        .filter((c) => c.name && c.amount > 0)
    : [];

  const draft = {
    items,
    tax,
    serviceCharge,
    rounding,
    additionalCharges,
    taxInclusive: false,
    subtotal: typeof bill.subtotal === "number" ? bill.subtotal : undefined,
    total: typeof bill.total === "number" ? bill.total : undefined,
  };
  // Prefer exclusive totals when tax is present; else inclusive.
  draft.taxInclusive = tax <= 0.05;
  const { subtotal, total } = inferTotalsFromCharges(draft);

  return {
    currency: String(bill.currency || "THB"),
    items,
    tax,
    serviceCharge,
    rounding,
    ...(additionalCharges.length ? { additionalCharges } : {}),
    discount: 0,
    subtotal,
    total,
    taxInclusive: draft.taxInclusive,
  };
}

function fixturePath(id: string): string {
  return join(FIXTURES_DIR, `${id}.json`);
}

async function listAllShareIds(): Promise<string[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "--list-all requires BLOB_READ_WRITE_TOKEN (Vercel Blob read-write token)"
    );
  }
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "bills/", cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const m = blob.pathname.match(/^bills\/([A-Za-z0-9]+)\//);
      if (m) ids.add(m[1]);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return [...ids].sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const existing = loadExisting();

  let shareIds = args.shareIds;
  if (args.listAll) {
    shareIds = await listAllShareIds();
    console.log(`Listed ${shareIds.length} share id(s) from Blob`);
  }
  if (shareIds.length === 0) {
    // Refresh every fixture that already has a shareId.
    shareIds = [...new Set(
      [...existing.values()]
        .map((f) => f.shareId)
        .filter((id): id is string => Boolean(id))
    )];
    console.log(`Refreshing ${shareIds.length} known share id(s)`);
  }

  for (const shareId of shareIds) {
    try {
      const bill = await fetchBillJson(shareId);
      const receiptUrl =
        typeof bill.receiptUrl === "string" && bill.receiptUrl
          ? bill.receiptUrl
          : `${DEFAULT_STORE}/bills/${shareId}/receipt.jpg`;
      const draftGold = billToDraftGold(bill);
      const normalized = normalizeExtractedBill({
        ...draftGold,
        printedItemUnits: 0,
      });
      const check = checkBillMath(normalized);
      const prior = [...existing.values()].find((f) => f.shareId === shareId);

      if (prior && prior.goldCorrected && !args.forceGold) {
        const updated: PhotoFixture = {
          ...prior,
          receiptUrl,
          receiptContentType:
            typeof bill.receiptContentType === "string"
              ? bill.receiptContentType
              : prior.receiptContentType || "image/jpeg",
        };
        writeFileSync(fixturePath(prior.id), JSON.stringify(updated, null, 2) + "\n");
        console.log(
          `refreshed URL ${prior.id} (kept corrected gold; blobReconciled=${check.ok})`
        );
        continue;
      }

      const id = prior?.id || `blob-${shareId}`;
      const fixture: PhotoFixture = {
        id,
        description:
          prior?.description ||
          `Imported from Blob share ${shareId}` +
            (check.ok ? "" : " — REVIEW: blob extract does not reconcile"),
        shareId,
        receiptUrl,
        receiptContentType:
          typeof bill.receiptContentType === "string"
            ? bill.receiptContentType
            : "image/jpeg",
        locked: prior?.locked ?? false,
        goldCorrected: prior?.goldCorrected ?? false,
        gold: args.forceGold || !prior ? draftGold : prior.gold,
        expect: prior?.expect ?? {
          taxInclusive: draftGold.taxInclusive,
          taxForUi: draftGold.taxInclusive ? 0 : draftGold.tax,
          total: draftGold.total,
          itemCount: draftGold.items.length,
          reconciled: check.ok,
          vatConsistency: "skip",
          noNegativeItems: !draftGold.items.some((it) => it.price < 0),
          minItemRecall: 0.9,
          maxPriceMae: 0.5,
        },
      };
      writeFileSync(fixturePath(id), JSON.stringify(fixture, null, 2) + "\n");
      console.log(
        `${prior ? "updated" : "created"} ${id} locked=${fixture.locked} blobReconciled=${check.ok}`
      );
    } catch (err) {
      console.error(`share ${shareId}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
