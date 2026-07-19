# Customer how-to video

Generates `public/how-to-use.mp4` — a short silent walkthrough for customers covering upload → pick items → share → payment tracking.

## Regenerate

```bash
# From the repo root (Playwright is used as a one-off; not a product dependency)
npm install --no-save playwright
npx playwright install chromium
npm run video:howto
```

Output:

- `public/how-to-use.mp4` — H.264, 1280×720
- `public/how-to-use-poster.jpg` — title-card still

## Edit the storyboard

Scenes and captions live in `walkthrough.html`. Duration per scene is set in the `durations` array in that file (keep `record.mjs`’s `totalMs` in sync if you change lengths).
