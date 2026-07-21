export type BillItem = {
  id: string;
  name: string;
  /**
   * Optional English (or other target-language) gloss of `name`.
   * Set during extraction or via the Translate action when the receipt
   * name is non-Latin / hard to read. Omitted when unnecessary.
   */
  nameTranslated?: string;
  /**
   * The LINE total for this row as printed on the receipt (not a unit price).
   * For a row "3  Latte   12.00", `price` is 12.00 and `quantity` is 3.
   */
  price: number;
  /** Units of this item on the line. Used to support fractional selection. */
  quantity: number;
  /** How many of this line the user is taking. 0 ≤ selectedQuantity ≤ quantity. */
  selectedQuantity: number;
  /**
   * How many people are splitting the user's selected portion of this line.
   * The user pays one equal share, so their cost is the selected portion
   * divided by `splitCount`. 1 means "not shared". Always ≥ 1.
   */
  splitCount: number;
};

/**
 * A non-item fee printed on the receipt (delivery, packaging, cover, bag,
 * corkage, etc.). Kept separate from tax / service so the totals UI can show
 * the same labels as the receipt.
 */
export type AdditionalCharge = {
  /** Label as printed (e.g. "Delivery Fee", "Packaging"). */
  name: string;
  amount: number;
};

export type ExtractedBill = {
  currency: string;
  items: Array<{
    name: string;
    /** English gloss when `name` is non-Latin or mixed-script; omit when unused. */
    nameTranslated?: string;
    /** Line total printed on the receipt for this row. */
    price: number;
    quantity: number;
  }>;
  tax: number;
  serviceCharge: number;
  /**
   * Receipt-level rounding adjustment (positive or negative). Some receipts
   * round the total to the nearest currency unit and print the offset as its
   * own line. Zero when absent.
   */
  rounding: number;
  /**
   * Extra bill-level fees beyond tax / service / rounding (delivery,
   * packaging, cover charge, bag fee, corkage, …). Empty when none.
   */
  additionalCharges: AdditionalCharge[];
  /**
   * Bill-level discount / promotion amount as a positive number (฿50 off → 50).
   * Applied after the items subtotal, before tax/service on typical receipts.
   */
  discount: number;
  /** Printed items subtotal from the receipt (before discount / tax). */
  subtotal: number;
  /** Printed grand total / amount due from the receipt. */
  total: number;
};

/** Result returned by `/api/extract` after validation + optional repair. */
export type ExtractionResponse = {
  bill: ExtractedBill;
  /** True when item sums and totals reconcile within a few cents. */
  reconciled: boolean;
  /** Remaining arithmetic / extraction issues the user should glance at. */
  warnings: string[];
};

/** A payment proof image attached to a shared bill by a recipient. */
export type StoredPaymentReceipt = {
  id: string;
  url: string;
  contentType: string;
  uploadedAt: number;
  /**
   * Who paid — preferably read from the transfer screenshot via vision.
   * Omitted on older uploads or when the slip has no readable sender name.
   */
  payerName?: string;
  /**
   * Amount transferred in the bill currency, usually OCR'd from the slip.
   * Omitted on legacy proofs that only stored a screenshot.
   */
  amountPaid?: number;
  /**
   * SHA-256 hex of the uploader's delete token. Never send this to browsers —
   * strip via `toPublicPaymentReceipt`. Omitted on legacy uploads.
   */
  deleteTokenHash?: string;
};

/** Structured fields pulled from a bank / PromptPay / PayNow transfer screenshot. */
export type ExtractedPaymentSlip = {
  /** Transfer amount (the money sent), always > 0 when extraction succeeds. */
  amount: number;
  /** Sender / payer name when printed on the slip; empty when absent. */
  payerName: string;
  /** ISO 4217 when clearly shown; empty when unknown. */
  currency: string;
};

/**
 * The shape persisted to Blob storage when a user shares a bill. Recipients
 * load this and run their own independent selection. Secret fields must be
 * stripped with `toPublicStoredBill` before rendering.
 */
export type StoredBill = {
  id: string;
  createdAt: number;
  receiptUrl: string;
  receiptContentType: string;
  /** Optional PromptPay / bank QR so recipients can pay the organiser. */
  bankingQrUrl?: string;
  bankingQrContentType?: string;
  /** Screenshots of transfers uploaded by people who opened the share link. */
  paymentReceipts?: StoredPaymentReceipt[];
  /**
   * FCM registration tokens for the sharer's device(s). Used to push a
   * notification when a recipient uploads a payment receipt.
   */
  notifyTokens?: string[];
  /**
   * SHA-256 hex of the bill owner's secret. Required to register notify tokens
   * (and to delete any payment proof). Omitted on legacy shares.
   */
  ownerTokenHash?: string;
  /**
   * Monotonic revision bumped on every bill.json write. Used with
   * `lastWriteId` for optimistic concurrency retries.
   */
  revision?: number;
  /** Unique id of the last successful writer; verifies CAS after put. */
  lastWriteId?: string;
  currency: string;
  items: Array<{
    name: string;
    /** English gloss; omitted on older shares and when unused. */
    nameTranslated?: string;
    price: number;
    quantity: number;
  }>;
  tax: number;
  serviceCharge: number;
  rounding: number;
  /** Bill-level discount amount (positive). Omitted on older shares → treat as 0. */
  discount?: number;
  /**
   * Extra fees beyond tax / service / rounding. Omitted on older shares → [].
   */
  additionalCharges?: AdditionalCharge[];
};

/**
 * What the selected subset adds up to, broken into the pieces we display.
 */
export type SplitBreakdown = {
  selectedSubtotal: number;
  /** Proportional share of the bill-level discount (positive number). */
  discountShare: number;
  taxShare: number;
  serviceShare: number;
  roundingShare: number;
  /** Proportional shares of each additional charge (same order as the bill). */
  additionalShares: Array<{
    name: string;
    billAmount: number;
    share: number;
  }>;
  total: number;
  /** Sum of all items on the receipt (price * qty). */
  itemsTotal: number;
  /** Fraction of the full bill that the selected items represent. */
  ratio: number;
};
