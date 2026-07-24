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
