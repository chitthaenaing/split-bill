# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Single **Next.js 16** app (`bill-split`) — a receipt photo → item selection → split-total PWA. No monorepo, no Docker, no local database. Optional hosted services: OpenAI (extraction), Vercel Blob (sharing), Firebase (accounts/push).

### Services

| Service | Required locally? | Start command |
|---------|-------------------|---------------|
| Next.js dev server | Yes | `npm run dev` → http://localhost:3000 |
| OpenAI API | For upload/extract only | Set `OPENAI_API_KEY` in `.env.local` (hosted) |
| Vercel Blob | For share links | Set `BLOB_READ_WRITE_TOKEN` in `.env.local` (hosted) |
| Firebase | Optional (accounts/push) | Hosted; client config is in `lib/firebase-config.ts` |

Use **tmux** for long-running dev servers (e.g. session `next-dev-server`).

### First-time / env setup

```bash
cp env.local.example .env.local
# Add OPENAI_API_KEY (and optionally BLOB_READ_WRITE_TOKEN) to .env.local
```

Without secrets, the app still runs: homepage loads, split math works, and offline tests pass. Receipt upload and share links need the respective env vars.

### Common commands

See `package.json` scripts and `README.md` for full detail:

- **Dev:** `npm run dev`
- **Typecheck/build:** `npm run build` (no separate ESLint script)
- **Unit tests:** `npm test`
- **Fixture tests:** `npm run test:fixtures`, `npm run test:transcripts`, `npm run test:photos`
- **Live vision scoreboard:** `RUN_PHOTO_SCOREBOARD=1 npm run test:photos:live` (needs `OPENAI_API_KEY`)

### Gotchas

- **No lint script** — rely on `npm run build` (Next.js + TypeScript) for static checks.
- **`/api/fx`** expects uppercase ISO 4217 codes (`?from=USD&to=EUR`).
- **Shared bill pages** (`/b/[id]`) require `BLOB_READ_WRITE_TOKEN` server-side to read from Vercel Blob.
- **Zustand persist key** is `bill-split` (version 11) — useful for UI demos without calling OpenAI.
