# Bill Split

A tiny single-page web app for figuring out exactly how much **you** owe from a shared receipt. Upload a photo, tap the items you had, and the app totals them up — including your proportional share of tax, service charge, and any rounding line on the bill.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** for styling
- **Zustand** for state, persisted to `localStorage`
- **Framer Motion** for subtle motion
- **OpenAI `gpt-4o`** (vision + JSON-schema structured outputs) for receipt parsing
- **Vercel Blob** for shareable links (receipt image + bill JSON)
- **lucide-react** for icons

## Getting started

```bash
# 1. Install
npm install

# 2. Configure
cp .env.local.example .env.local
# then put your OPENAI_API_KEY in .env.local

# 3. Run
npm run dev
```

Open <http://localhost:3000>.

### Swap the model

Set `OPENAI_MODEL` in `.env.local` to any OpenAI vision-capable model. Defaults to `gpt-4o`. Try `gpt-4.1` or `gpt-4.1-mini` for newer alternatives, or `gpt-4o-mini` to trade accuracy for cost.

## How it works

1. **Upload** — drag a receipt image into the dropzone (or tap on mobile). The photo is resized client-side before upload.
2. **Extract** — `/api/extract` sends the image to OpenAI with a JSON schema and gets back `{ items, tax, serviceCharge, rounding, currency, subtotal, total }`. The server checks that the numbers add up and asks the model to repair once if they don't.
3. **Pick** — tap each item you had. The totals panel updates live. Use the pencil on a row to fix a mis-read name or price.
4. **Your share** — the panel shows your items subtotal plus a proportional share of tax, service and rounding. One tap to copy the total.

Tax, service and rounding are editable too — flip the panel into edit mode if the AI got something off or you want to adjust the tip. If the extracted totals still don't reconcile, a warning banner shows the printed vs computed amounts.

## Sharing

Hit **Share link** once a bill is loaded. The receipt image and extracted items are uploaded to Vercel Blob and you get a URL like `https://your-app/b/abc123XYZ` you can send to anyone at the table. Each recipient opens the link, picks the items they had, and sees their own total — selections are kept local to each device and never shared.

Set up:

1. In your Vercel dashboard, create a Blob store (Storage → Blob → Create).
2. Copy the **read-write token** and put it in `.env.local`:

   ```
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   ```

3. Locally you can also run `vercel link` followed by `vercel env pull .env.local` if you'd rather not copy by hand.

Tax, service and rounding are read-only on the shared page (they're properties of the bill, not of any one recipient). Recipients see a "New bill" link if they want to start their own.

## Project layout

```
app/
  api/extract/route.ts    server route that calls OpenAI
  api/share/route.ts      server route that writes to Vercel Blob
  b/[id]/                 the public shared-bill page
  layout.tsx, page.tsx    single-page app shell
components/
  upload-card.tsx         drop zone (empty state)
  items-list.tsx          item checkboxes / quantity steppers (props-based)
  totals-panel.tsx        live totals + edit mode (props-based)
  share-button.tsx        share-link dialog
  receipt-thumbnail.tsx   side panel + lightbox
  ui/                     small primitives (button, card, input)
lib/
  store.ts                Zustand store for the creator flow
  calc.ts                 pure split math (unit-testable)
  bill-extract.ts         normalize + arithmetic reconciliation
  openai.ts               prompt + schema + repair retry
  image-prep.ts           client-side resize/JPEG encode
  share.ts                Vercel Blob put/get helpers (server-only)
types/bill.ts             shared types
```

## Notes

- Bill data is kept in `localStorage` so a refresh won't lose your selection. Use "New bill" to reset.
- No database, no auth — everything happens in your browser and a single server route.
- Run extraction unit tests with `npm test`.
