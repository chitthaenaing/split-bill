# Bill Split

A tiny single-page web app for figuring out exactly how much **you** owe from a shared receipt. Upload a photo, tap the items you had, and the app totals them up — including your proportional share of tax, service charge, and any rounding line on the bill.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** for styling
- **Zustand** for state, persisted to `localStorage`
- **Framer Motion** for subtle motion
- **OpenAI `gpt-4o`** (vision + JSON-schema structured outputs) for receipt parsing
- **Vercel Blob** for shareable links (receipt image + bill JSON)
- **Firebase Auth** (Google sign-in) + **Firestore** for optional account bill history
- **Firebase Cloud Messaging** for payment push alerts
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
2. **Extract** — `/api/extract` sends the image to OpenAI with a JSON schema and gets back `{ items, tax, serviceCharge, rounding, currency, subtotal, total }`. Non-Latin item names also get an optional English gloss (`nameTranslated`). The server checks that the numbers add up and asks the model to repair once if they don't.
3. **Pick** — tap each item you had. The totals panel updates live. Translated names show first with the original underneath. Use **Translate** for names that still need a gloss, or the pencil on a row to fix a mis-read name, translation, or price.
4. **Your share** — the panel shows your items subtotal plus a proportional share of tax, service and rounding. One tap to copy the total.

Tax, service and rounding are editable too — flip the panel into edit mode if the AI got something off or you want to adjust the tip. If the extracted totals still don't reconcile, a warning banner shows the printed vs computed amounts.

## Sharing

Hit **Share link** once a bill is loaded. The receipt image and extracted items are uploaded to Vercel Blob (as a compressed multipart upload) and you get a URL like `https://your-app/b/abc123XYZ` you can send to anyone at the table. Each recipient opens the link, picks the items they had, and sees their own total — selections are kept local to each device and never shared.

After paying, recipients can drop a **bank transfer screenshot**. The same vision model used for receipts scans the slip for the **amount** and **sender name** (nothing to type). The share page shows who paid what, the paid total, and how much of the bill is left.

The creator gets an owner token (stored in `localStorage` on that device) used to enable payment-push alerts and to delete any transfer proof. Recipients who upload a payment screenshot get a delete token for their own proof. Shared bill JSON is updated with conflict retries so concurrent uploads don’t clobber each other, and secrets (FCM tokens, owner/delete hashes) are stripped before the page is rendered.

Set up:

1. In your Vercel dashboard, create a Blob store (Storage → Blob → Create).
2. Copy the **read-write token** and put it in `.env.local`:

   ```
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   ```

3. Locally you can also run `vercel link` followed by `vercel env pull .env.local` if you'd rather not copy by hand.

Tax, service and rounding are read-only on the shared page (they're properties of the bill, not of any one recipient). Recipients see a "New bill" link if they want to start their own.

## Accounts (optional)

Sign in with Google to keep a cross-device list of bills you **shared** and bills you **opened**. Guest use still works — accounts only add history under **My bills** (`/account`).

Bill payloads stay on Vercel Blob. Firestore only stores a per-user index (`users/{uid}/links/{shareId}`). All Firestore access goes through server routes with the Admin SDK; deploy `firestore.rules` from this repo (deny client access).

Setup (project `split-bill-noti`):

1. Authentication → Sign-in method → enable **Google**.
2. Create a **Firestore** database; deploy `firestore.rules`.
3. Add your production domain under Authentication → Settings → Authorized domains.
4. Set `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (same service account as push) in `.env.local` / Vercel env.

Note: `package.json` pins `jose@4.15.9` via `overrides` so `firebase-admin` → `jwks-rsa` can run under Vercel’s CommonJS serverless loader (`jose@6` is ESM-only and throws `ERR_REQUIRE_ESM`).

## Project layout

```
app/
  api/extract/route.ts         server route that calls OpenAI
  api/translate-items/route.ts English glosses for item names
  api/fx/route.ts              Frankfurter mid-market FX rates (cached)
  api/share/route.ts           server route that writes to Vercel Blob
  api/me/bills/route.ts        list / record signed-in user bill links
  account/                     My bills (shared + received)
  b/[id]/                      the public shared-bill page
  layout.tsx, page.tsx         single-page app shell
components/
  account-menu.tsx        Google sign-in / account menu
  auth-provider.tsx       Firebase Auth context
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
  frankfurter.ts          Frankfurter rate fetch + convert helpers
  display-currency.ts     per-device preferred display currency
  use-fx-rate.ts          client hook for `/api/fx`
  openai.ts               prompt + schema + repair retry
  openai-transcripts.test.ts  scripted vision response harness
  image-prep.ts           client-side resize/JPEG encode
  share.ts                Vercel Blob put/get helpers (server-only)
  share-tokens.ts         owner/delete token hash helpers
  share-client.ts         localStorage helpers for share tokens
  public-bill.ts          strip secrets before rendering shared bills
  openai-payment.ts       vision extract for transfer screenshots
  payment-balance.ts      paid totals / remaining from scanned slips
  firebase-app.ts         shared browser Firebase app
  firebase-auth-client.ts Google sign-in helpers
  firebase-admin.ts       Admin SDK (push, Auth, Firestore)
  auth-request.ts         verify Bearer ID tokens
  user-bills.ts           Firestore user→bill index
fixtures/
  receipts/               arithmetic / VAT scoreboard JSON
  model-transcripts/      mocked model responses for extract+repair
types/bill.ts             shared types
types/user-bills.ts       account bill-index types
firestore.rules           deny direct client Firestore access
```

## Currency conversion

The totals panel can show your share in another currency via [Frankfurter](https://www.frankfurter.app/) (central-bank mid-market daily rates). Split math stays in the receipt currency; the converted amount is display-only. Your preferred display currency is stored in `localStorage`. Rates are fetched through `/api/fx` and cached for a few hours.

## Notes

- Bill data is kept in `localStorage` so a refresh won't lose your selection. Use "New bill" to reset.
- Sharing works without an account. Google sign-in is optional and only powers “My bills” history (Firestore index + Blob payloads).
- Run extraction unit tests with `npm test`.
- Receipt arithmetic fixtures live in `fixtures/receipts/` (`npm run test:fixtures`).
- Scripted vision-model transcripts live in `fixtures/model-transcripts/` (`npm run test:transcripts`) — they exercise prompt, JSON schema, repair, and finalize without calling OpenAI.
