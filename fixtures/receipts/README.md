# Receipt fixtures

Structured receipt cases for arithmetic / VAT consistency checks. These are
**not** photos — unit tests load the JSON and run `normalizeExtractedBill`
without calling OpenAI.

## Shape

```json
{
  "id": "th-abb-inclusive-air-plus",
  "description": "Short human-readable note",
  "raw": {
    "currency": "THB",
    "items": [{ "name": "…", "price": 0, "quantity": 1 }],
    "tax": 0,
    "serviceCharge": 0,
    "rounding": 0,
    "discount": 0,
    "subtotal": 0,
    "total": 0,
    "taxInclusive": true
  },
  "expect": {
    "taxInclusive": true,
    "taxForUi": 0,
    "total": 793,
    "itemCount": 8,
    "noNegativeItems": true,
    "reconciled": true,
    "vatConsistency": "warn"
  }
}
```

`vatConsistency`: `"ok"` (printed VAT matches rate), `"warn"` (soft mismatch),
or `"skip"` (no rate check — e.g. USD/EUR without a known locale rate).
Known rates: THB 7%, SGD 8%/9% (either accepted).

Inclusive vs exclusive: keep a `taxInclusive` flag on extract, reconcile with
arithmetic (flip when exclusive math overshoots by exactly the printed tax),
and clear informational tax before the split UI. Singapore "ADD GST" and Thai
"Included Vat" are inclusive breakdowns — never add them on top.

Run the scoreboard: `npm run test:fixtures` (also included in `npm test`).
