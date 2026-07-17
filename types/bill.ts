export type BillItem = {
  id: string;
  name: string;
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

export type ExtractedBill = {
  currency: string;
  items: Array<{
    name: string;
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
  /** Printed items subtotal from the receipt (before or including tax). */
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
  /** Who paid — shown to the person who shared the bill. Omitted on older uploads. */
  payerName?: string;
};

/**
 * The shape persisted to Blob storage when a user shares a bill. Recipients
 * load this and run their own independent selection.
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
  currency: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  tax: number;
  serviceCharge: number;
  rounding: number;
};

/**
 * What the selected subset adds up to, broken into the pieces we display.
 */
export type SplitBreakdown = {
  selectedSubtotal: number;
  taxShare: number;
  serviceShare: number;
  roundingShare: number;
  total: number;
  /** Sum of all items on the receipt (price * qty). */
  itemsTotal: number;
  /** Fraction of the full bill that the selected items represent. */
  ratio: number;
};
