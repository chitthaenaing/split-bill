# Receipt extraction fix policy

**Do not fix one broken receipt by editing the global system prompt.**
That prompt is shared by every extract; case-specific edits routinely regress receipts that already worked.

## Preferred order

1. **Post-process** — Fix arithmetic / layout in [`lib/bill-extract.ts`](../lib/bill-extract.ts) (`normalizeExtractedBill`, `reconcileBill`, junk/fee salvage). Unit-testable; no model behavior change for unrelated receipts.
2. **Targeted repair** — Narrow the one-shot repair message via `classifyRepairModes` / `formatCheckForRepair`. Add a model-transcript fixture that replays the bad → good responses.
3. **System prompt** — Only for a *general* perception rule (e.g. “leading digit is quantity”). Keep it short. Ship only when the full scoreboard stays green.

## Required gate before merging

For every extraction bugfix:

1. Add or update a **receipt fixture** under `fixtures/receipts/` when the issue is post-process / math / VAT.
2. Add or update a **model transcript** under `fixtures/model-transcripts/` when the issue is prompt / schema / repair orchestration.
3. If the bug came from a real photo, add or update a **photo fixture** under `fixtures/photos/` (gold label + `receiptUrl` from Vercel Blob) and keep it `locked: true`.
4. Run `npm test`. All fixtures / transcripts / photo gold checks must pass.

## Photo scoreboard

- Offline (always in `npm test`): gold labels must still normalize and match `expect`.
- Live (`npm run test:photos:live`): re-extract from Blob receipt images with OpenAI and score against gold. Requires `OPENAI_API_KEY`.
- Import / refresh from Blob: `npm run photos:import` (optional `BLOB_READ_WRITE_TOKEN` to list all shares; otherwise known share IDs + public store host).

Blob `bill.json` is **not** always gold — some shares still store a wrong extract. Corrected gold lives in `fixtures/photos/*.json`.

## Handwritten garage / motorcycle invoices

Thai workshop forms (parts + `ค่าแรง` labor + pickup fees, total often handwritten as รวม) are **not** F&B. Labor and pickup lines stay in `items`; `serviceCharge` is only restaurant % service. Post-process clears a spurious `serviceCharge` when garage items already sum to the printed total. See `fixtures/receipts/th-handwritten-motorcycle-service.json`.

## Bare PLU / SKU rows (S&P / Green Tea style)

Some Thai POS receipts print a zero-priced product-code line (e.g. `1133371101`) that is counted in `Items: N` but is not a pickable dish. Post-process drops those rows and shrinks `printedItemUnits` so quantity reconciliation does not inflate real dish quantities (e.g. Pone Mhan / Chicken Tempura). See `fixtures/receipts/th-sp-bare-plu-items-footer.json`.

## Promotion / discount minus lines vs Items:N

**Bill-level** discounts (`Discount 10%`, `Promotion Tier Discount`, vouchers) are salvaged into the totals `discount` field (positive amount off) — not pickable items. **Free-item** promos (`Promotion Free Tea -50`) stay as negative-priced items so the diner who got the freebie can claim them. POS `Items: N` counts sold products only. See `fixtures/receipts/th-promo-tier-items-footer.json` and `fixtures/receipts/th-promo-minus-line.json`.

## Quantity overcount vs Items:N (Brew / FoodStory)

When `sum(quantity of price ≥ 0)` is one higher than `Items: N` and exactly one non-staple line shows qty 2 (often Pone Mhan/Hman mis-read from a leftmost 1, while Rice ×2 is real), post-process deflates that dish to qty 1. Staple sides named Rice / Ice / Water are left alone. See `fixtures/receipts/th-brew-pone-mhan-qty-overcount.json`.
