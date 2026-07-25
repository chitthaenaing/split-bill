import type { AdditionalCharge, ExtractedBill } from "@/types/bill";
import {
  MONEY_TOLERANCE,
  checkBillMath,
  normalizeExtractedBill,
  toExtractedBill,
  type NormalizedBill,
} from "@/lib/bill-extract";
import { checkVatConsistency } from "@/lib/vat-check";

/** Gold label for a real receipt photo (corrected truth, not raw Blob bill.json). */
export type PhotoGold = {
  currency: string;
  items: Array<{
    name: string;
    nameTranslated?: string;
    price: number;
    quantity: number;
  }>;
  tax: number;
  serviceCharge: number;
  rounding: number;
  additionalCharges?: AdditionalCharge[];
  discount?: number;
  subtotal: number;
  total: number;
  taxInclusive: boolean;
  printedItemUnits?: number;
};

export type PhotoExpect = {
  taxInclusive: boolean;
  taxForUi: number;
  total: number;
  itemCount: number;
  reconciled: boolean;
  vatConsistency?: "ok" | "warn" | "skip";
  noNegativeItems?: boolean;
  itemNameIncludes?: string[];
  itemQuantityIncludes?: Array<{ nameIncludes: string; quantity: number }>;
  /** Minimum fraction of gold items matched by name+price (0–1). Live scoreboard. */
  minItemRecall?: number;
  /** Max average absolute price error on matched items. Live scoreboard. */
  maxPriceMae?: number;
};

export type PhotoFixture = {
  id: string;
  description: string;
  /** Vercel Blob share id when sourced from production storage. */
  shareId?: string;
  /** Public receipt image URL (usually Blob). Required for live scoreboard. */
  receiptUrl: string;
  receiptContentType?: string;
  /** When true, live scoreboard failures fail the suite (known-good lock). */
  locked: boolean;
  /**
   * When true, Blob bill.json was wrong / incomplete — gold was hand-corrected.
   * Import must not overwrite gold from Blob without --force-gold.
   */
  goldCorrected?: boolean;
  gold: PhotoGold;
  expect: PhotoExpect;
};

export type PhotoScore = {
  id: string;
  locked: boolean;
  failures: string[];
  itemRecall?: number;
  priceMae?: number;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Match predicted items to gold by name (+ optional price proximity).
 * Returns recall = matchedGold / goldCount and MAE over matched prices.
 */
export function scoreItemsAgainstGold(
  predicted: ExtractedBill["items"],
  gold: PhotoGold["items"]
): { recall: number; priceMae: number; unmatchedGold: string[] } {
  if (gold.length === 0) {
    return { recall: 1, priceMae: 0, unmatchedGold: [] };
  }

  const used = new Set<number>();
  let priceAbs = 0;
  let matched = 0;
  const unmatchedGold: string[] = [];

  for (const g of gold) {
    const gName = normalizeName(g.name);
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < predicted.length; i++) {
      if (used.has(i)) continue;
      const p = predicted[i];
      const pName = normalizeName(p.name);
      if (!pName.includes(gName) && !gName.includes(pName)) continue;
      const dist = Math.abs(p.price - g.price);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestDist > 1.0) {
      unmatchedGold.push(g.name);
      continue;
    }
    used.add(bestIdx);
    matched += 1;
    priceAbs += bestDist;
  }

  return {
    recall: matched / gold.length,
    priceMae: matched > 0 ? priceAbs / matched : 0,
    unmatchedGold,
  };
}

/** Offline: gold must normalize and satisfy expect (no vision call). */
export function evaluatePhotoGold(fixture: PhotoFixture): string[] {
  const failures: string[] = [];
  const raw = {
    ...fixture.gold,
    printedItemUnits: fixture.gold.printedItemUnits ?? 0,
  };
  const normalized = normalizeExtractedBill(raw);
  const check = checkBillMath(normalized);
  const extracted = toExtractedBill(normalized);
  const vat = checkVatConsistency(normalized);
  const exp = fixture.expect;

  if (!fixture.receiptUrl) {
    failures.push("missing receiptUrl");
  }
  if (normalized.taxInclusive !== exp.taxInclusive) {
    failures.push(
      `taxInclusive: got ${normalized.taxInclusive}, want ${exp.taxInclusive}`
    );
  }
  if (extracted.tax !== exp.taxForUi) {
    failures.push(`taxForUi: got ${extracted.tax}, want ${exp.taxForUi}`);
  }
  if (Math.abs(extracted.total - exp.total) > MONEY_TOLERANCE) {
    failures.push(`total: got ${extracted.total}, want ${exp.total}`);
  }
  if (extracted.items.length !== exp.itemCount) {
    failures.push(
      `itemCount: got ${extracted.items.length}, want ${exp.itemCount}`
    );
  }
  if (check.ok !== exp.reconciled) {
    failures.push(
      `reconciled: got ${check.ok}, want ${exp.reconciled}` +
        (check.messages.length ? ` (${check.messages.join("; ")})` : "")
    );
  }

  if (exp.noNegativeItems === true) {
    if (extracted.items.some((it) => it.price < 0)) {
      failures.push("expected no negative items");
    }
  } else if (exp.noNegativeItems === false) {
    if (!extracted.items.some((it) => it.price < 0)) {
      failures.push("expected a negative promotion item");
    }
  }

  for (const fragment of exp.itemNameIncludes ?? []) {
    if (!extracted.items.some((it) => it.name.includes(fragment))) {
      failures.push(`missing item name fragment "${fragment}"`);
    }
  }
  for (const spec of exp.itemQuantityIncludes ?? []) {
    const hit = extracted.items.find((it) =>
      it.name.includes(spec.nameIncludes)
    );
    if (!hit) {
      failures.push(`missing item for quantity assert "${spec.nameIncludes}"`);
    } else if (hit.quantity !== spec.quantity) {
      failures.push(
        `quantity for "${spec.nameIncludes}": got ${hit.quantity}, want ${spec.quantity}`
      );
    }
  }

  const vatMode = exp.vatConsistency ?? "skip";
  if (vatMode === "skip") {
    // ok — photo fixtures often skip when locale rate is unknown
  } else if (vatMode === "ok") {
    if (vat.skipped || !vat.ok) {
      failures.push(
        `vatConsistency: expected ok, got skipped=${vat.skipped} ok=${vat.ok}`
      );
    }
  } else if (vatMode === "warn") {
    if (vat.skipped || vat.ok || vat.messages.length === 0) {
      failures.push(
        `vatConsistency: expected warn, got skipped=${vat.skipped} ok=${vat.ok}`
      );
    }
  }

  return failures;
}

/** Live: compare a vision extraction result to gold. */
export function evaluatePhotoExtraction(
  fixture: PhotoFixture,
  bill: ExtractedBill,
  reconciled: boolean
): PhotoScore {
  const failures: string[] = [];
  const exp = fixture.expect;
  const gold = fixture.gold;

  if (reconciled !== exp.reconciled) {
    failures.push(`reconciled: got ${reconciled}, want ${exp.reconciled}`);
  }
  if (Math.abs(bill.total - exp.total) > MONEY_TOLERANCE) {
    failures.push(`total: got ${bill.total}, want ${exp.total}`);
  }
  if (Math.abs(bill.tax - exp.taxForUi) > MONEY_TOLERANCE) {
    failures.push(`taxForUi: got ${bill.tax}, want ${exp.taxForUi}`);
  }
  if (bill.items.length !== exp.itemCount) {
    failures.push(
      `itemCount: got ${bill.items.length}, want ${exp.itemCount}`
    );
  }

  for (const fragment of exp.itemNameIncludes ?? []) {
    if (!bill.items.some((it) => it.name.includes(fragment))) {
      failures.push(`missing item name fragment "${fragment}"`);
    }
  }
  for (const spec of exp.itemQuantityIncludes ?? []) {
    const hit = bill.items.find((it) => it.name.includes(spec.nameIncludes));
    if (!hit) {
      failures.push(`missing item for quantity assert "${spec.nameIncludes}"`);
    } else if (hit.quantity !== spec.quantity) {
      failures.push(
        `quantity for "${spec.nameIncludes}": got ${hit.quantity}, want ${spec.quantity}`
      );
    }
  }

  const { recall, priceMae, unmatchedGold } = scoreItemsAgainstGold(
    bill.items,
    gold.items
  );
  const minRecall = exp.minItemRecall ?? 0.9;
  const maxMae = exp.maxPriceMae ?? 0.5;
  if (recall + 1e-9 < minRecall) {
    failures.push(
      `itemRecall: got ${recall.toFixed(2)}, want ≥ ${minRecall}` +
        (unmatchedGold.length
          ? ` (missing: ${unmatchedGold.slice(0, 5).join(", ")})`
          : "")
    );
  }
  if (priceMae > maxMae) {
    failures.push(`priceMae: got ${priceMae.toFixed(2)}, want ≤ ${maxMae}`);
  }

  return {
    id: fixture.id,
    locked: fixture.locked,
    failures,
    itemRecall: recall,
    priceMae,
  };
}

/** Build a data URL from downloaded image bytes. */
export function imageBytesToDataUrl(
  bytes: Uint8Array,
  contentType = "image/jpeg"
): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${b64}`;
}

export async function fetchReceiptDataUrl(
  receiptUrl: string,
  contentType = "image/jpeg"
): Promise<string> {
  const res = await fetch(receiptUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch receipt ${receiptUrl}: HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || contentType;
  return imageBytesToDataUrl(buf, ct.split(";")[0].trim() || contentType);
}

/** Helper for scripts: infer subtotal/total when Blob JSON omitted them. */
export function inferTotalsFromCharges(gold: {
  items: Array<{ price: number }>;
  tax: number;
  serviceCharge: number;
  rounding: number;
  additionalCharges?: AdditionalCharge[];
  taxInclusive: boolean;
  subtotal?: number;
  total?: number;
}): { subtotal: number; total: number } {
  const itemsSum = gold.items
    .filter((it) => it.price >= 0)
    .reduce((s, it) => s + it.price, 0);
  const net = gold.items.reduce((s, it) => s + it.price, 0);
  const extras = (gold.additionalCharges ?? []).reduce(
    (s, c) => s + Math.max(0, c.amount),
    0
  );
  const subtotal =
    typeof gold.subtotal === "number" && Number.isFinite(gold.subtotal)
      ? gold.subtotal
      : Math.round(itemsSum * 100) / 100;
  const total =
    typeof gold.total === "number" && Number.isFinite(gold.total)
      ? gold.total
      : Math.round(
          (gold.taxInclusive
            ? net + gold.serviceCharge + extras + gold.rounding
            : net + gold.tax + gold.serviceCharge + extras + gold.rounding) *
            100
        ) / 100;
  return { subtotal, total };
}

export type { NormalizedBill };
