# Model transcript fixtures

Scripted OpenAI vision responses for extraction orchestration tests. These are
**not** receipt photos — tests inject a fake chat-completions client that
returns the JSON in `responses[]` in order.

This catches regressions in:

- the system prompt / JSON schema contract
- the one-shot repair loop (`formatCheckForRepair`)
- post-processing (`normalizeExtractedBill` → `finalizeExtraction`)

without needing `OPENAI_API_KEY` or real images.

## Shape

```json
{
  "id": "th-abb-mislabelled-exclusive",
  "description": "Short human-readable note",
  "imageDataUrl": "data:image/jpeg;base64,AAAA",
  "responses": [
    { "content": { "currency": "THB", "items": [], "tax": 0, "…": "…" } }
  ],
  "expect": {
    "calls": 1,
    "reconciled": true,
    "taxForUi": 0,
    "total": 793,
    "itemCount": 8,
    "hasNegativeItem": false,
    "hasRepairPrompt": false,
    "nameTranslatedIncludes": ["Mohinga"]
  }
}
```

`responses[i].content` is the raw model JSON (stringified by the fake client).
When arithmetic still fails after the first response, a second entry is used
for the repair call.

Run: `npm run test:transcripts` (also included in `npm test`).
