# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Single-page **Next.js 16** (App Router) app: upload a receipt photo → OpenAI vision extracts items/totals → user taps items they had → app computes their share (including proportional tax/service/rounding/discount). Optional "Share link" flow lets multiple recipients split the same bill independently via Vercel Blob-hosted state. Optional Google sign-in (Firebase Auth + Firestore) adds cross-device bill history and a saved payment QR. No database beyond Blob JSON + a thin Firestore index; no Docker/monorepo.

## Commands

```bash
npm run dev             # dev server, http://localhost:3000
npm run build           # production build — this IS the typecheck/lint gate (no separate lint script)
npm test                # all lib/**/*.test.ts via tsx --test
npm run test:fixtures   # fixtures/receipts/ — arithmetic/VAT reconciliation scoreboard
npm run test:transcripts # fixtures/model-transcripts/ — scripted OpenAI responses (prompt/schema/repair, no network)
npm run test:photos     # fixtures/photos/ gold labels, offline (normalize + match only)
RUN_PHOTO_SCOREBOARD=1 npm run test:photos:live  # re-extract real photos via OpenAI and score vs gold (needs OPENAI_API_KEY)
npm run photos:import   # refresh fixtures/photos/ from Vercel Blob (BLOB_READ_WRITE_TOKEN optional)
```

Run a single test file directly: `tsx --test lib/bill-extract.test.ts`.

There is no ESLint script — `npm run build` (Next.js + TypeScript) is the static-check gate.

### Env setup

`cp env.local.example .env.local`. The app runs with no secrets (homepage, split math, offline tests all work). `OPENAI_API_KEY` is needed for upload/extract and payment-slip scanning; `BLOB_READ_WRITE_TOKEN` for share links; Firebase web config (already in `lib/firebase-config.ts`) + `NEXT_PUBLIC_FIREBASE_VAPID_KEY` + `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` for push notifications. Accounts (Google sign-in, My Bills) only need client Auth + Firestore — no Admin credentials.

## Architecture

### Extraction pipeline (receipt photo → structured bill)

`app/api/extract/route.ts` → `lib/openai.ts` (prompt + JSON schema + one-shot repair) → `lib/bill-extract.ts` (`normalizeExtractedBill`, `reconcileBill`). The normalizer classifies each raw line via regexes into: pickable item, junk (subtotal/tax labels the model echoed as a row), labor/parts (Thai garage invoices — never junked), additional-charge (delivery/packaging/bag fee etc. → `additionalCharges`), or bill-level discount (→ `discount`, not an item). `lib/repair-modes.ts` classifies *why* reconciliation failed (`classifyRepairModes`) and produces a narrow, targeted repair prompt (`repairModeHints`) instead of retrying blind.

**Fix-policy invariant (see `docs/EXTRACTION_FIX_POLICY.md`)**: never fix a single broken receipt by editing the shared OpenAI system prompt — it regresses other receipts. Fix order is (1) post-process in `lib/bill-extract.ts`, (2) narrow the repair-mode message, (3) a genuinely general system-prompt rule, shipped only if the full scoreboard (`npm test`) stays green. Every extraction bugfix should add/update a fixture in `fixtures/receipts/` (math/VAT), `fixtures/model-transcripts/` (prompt/schema/repair), and/or `fixtures/photos/` (real photo, `locked: true` gold label).

`types/bill.ts` is the shared vocabulary: `ExtractedBill` (raw normalized shape), `BillItem` (adds `selectedQuantity`/`splitCount` for the picking UI), `StoredBill` (what's persisted to Blob for a share, superset with tokens/participants/receipts), `SplitBreakdown` (computed output of `lib/calc.ts`).

### State

`lib/store.ts` is a single Zustand store (persisted to `localStorage`, key `bill-split`, versioned — bump the version on shape changes) holding the *creator's* in-progress bill: items, selection state, tax/service/rounding/discount/additionalCharges, and extraction warnings/rescan count. `lib/calc.ts` is pure functions that turn a selection into a `SplitBreakdown` (proportional shares of tax/service/rounding/discount/additional charges) — kept side-effect-free and unit-tested independently of the store.

Shared bill pages (`app/b/[id]/shared-bill.tsx`) do **not** use the Zustand store — each recipient's selection lives only in that browser's `localStorage`, keyed by share id, so selections are never synced between recipients.

### Sharing (`lib/share.ts`, server-only)

Bill JSON and images live on Vercel Blob under `bills/{shareId}/`. Concurrent writes (e.g. two people uploading payment proofs at once) use read-modify-write with **immutable per-write state snapshots** (`bills/{shareId}/states/{writeId}.json`) rather than overwriting `bill.json` in place — the public Blob CDN can serve a stale body for ~60s after an overwrite, which broke optimistic-concurrency verification when the pathname was reused. `bill.json` itself is still written as a best-effort mirror for older readers. `getShare()` reads the newest state snapshot by `uploadedAt`, falling back to legacy `bill.json`. `mutateStoredBill()` retries up to `MUTATE_MAX_ATTEMPTS` on a detected race.

Auth on a share is capability-token based, not user-based: `ownerTokenHash`/`deleteTokenHash` (SHA-256 of a random token minted at creation, held client-side in `localStorage` via `lib/share-client.ts`) gate registering push tokens and deleting payment proofs — see `lib/share-tokens.ts`. `lib/public-bill.ts` strips these hashes and FCM tokens before a shared bill is ever sent to a browser. Bill-level fields (tax/service/rounding/discount) are read-only for recipients — only the creator can edit them, by re-sharing.

Payment proofs are bank-transfer screenshots scanned via the same vision model (`lib/openai-payment.ts`) to pull `amount`/`payerName` automatically; `lib/payment-balance.ts` computes paid-so-far/remaining from the accumulated `paymentReceipts`.

### Accounts (optional, client-driven)

Google sign-in (`lib/firebase-auth-client.ts`, `components/auth-provider.tsx`) + Firestore writes happen directly from the browser under the signed-in user's Auth session — no server Admin credentials needed for this path (Admin SDK, `lib/firebase-admin.ts`, is only used server-side for FCM push). Firestore holds a thin per-user index (`users/{uid}/links/{shareId}`, via `lib/user-bills-client.ts`) pointing at Blob-hosted bills, plus an optional profile doc (`users/{uid}`, via `lib/user-profile-client.ts`) with a saved payment-QR Blob URL. `firestore.rules` enforces field shape and ownership; redeploy it (`firebase deploy --only firestore:rules`) after changing the profile/link schema.

### Currency display

Split math always stays in the receipt's own currency. `lib/frankfurter.ts` + `/api/fx` (cached) + `lib/use-fx-rate.ts` add an optional *display-only* conversion; `lib/display-currency.ts` persists the viewer's preferred display currency per device. Never let a converted amount feed back into split arithmetic.

## Testing conventions

Tests are plain `node:test` files (via `tsx`) colocated as `lib/*.test.ts`, not a separate `__tests__` tree. `lib/openai-transcripts.test.ts` and `fixtures/model-transcripts/` replay scripted OpenAI responses to exercise the extract→check→repair loop without network calls. `lib/photo-scoreboard.live.test.ts` is excluded from `npm test` (gated behind `RUN_PHOTO_SCOREBOARD=1` since it costs OpenAI calls against real photos).
