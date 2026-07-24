# Photo fixtures (real receipt scoreboard)

Locked gold labels for receipt **photos** stored on Vercel Blob. These catch
regressions that JSON-only receipt fixtures and scripted model transcripts
cannot: a prompt change that makes the live vision model worse on a known
receipt.

## Fix policy

See [`docs/EXTRACTION_FIX_POLICY.md`](../../docs/EXTRACTION_FIX_POLICY.md).
Do not edit `EXTRACTION_SYSTEM_PROMPT` to fix one photo without updating this
scoreboard and keeping all locked cases green.

## Shape

```json
{
  "id": "blob-TgBHtkvDzE-shwe-daily-special",
  "description": "…",
  "shareId": "TgBHtkvDzE",
  "receiptUrl": "https://….public.blob.vercel-storage.com/bills/…/receipt.jpg",
  "locked": true,
  "goldCorrected": true,
  "gold": { "currency": "THB", "items": [], "tax": 0, "total": 0, "taxInclusive": false },
  "expect": { "itemCount": 11, "total": 1376, "reconciled": true, "minItemRecall": 0.9 }
}
```

`goldCorrected: true` means Blob `bill.json` was wrong — import will refresh
`receiptUrl` but will **not** overwrite gold unless `--force-gold`.

## Commands

```bash
# Offline gold consistency (also part of npm test)
npm run test:photos

# Refresh receipt URLs for known share ids (public Blob host)
npm run photos:import

# Discover every share under bills/ (needs BLOB_READ_WRITE_TOKEN)
BLOB_READ_WRITE_TOKEN=… npm run photos:import -- --list-all

# Live vision re-extract vs gold (needs OPENAI_API_KEY; costs money)
RUN_PHOTO_SCOREBOARD=1 npm run test:photos:live
```

## Adding a new failure

1. Prefer fixing in `lib/bill-extract.ts` or repair modes — not the system prompt.
2. If the receipt is already shared, note its `/b/{shareId}` and run import.
3. Hand-correct `gold` + `expect`, set `locked: true` and `goldCorrected: true`.
4. Add a receipt fixture and/or model transcript for the same failure mode.
5. Run `npm test`. Only then consider a minimal prompt tweak.
