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

Run the scoreboard: `npm run test:fixtures` (also included in `npm test`).
