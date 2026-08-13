export type UserBillRole = "shared" | "received";

/** One person's paid total on a shared bill (from payment proofs). */
export type UserBillPayer = {
  name: string;
  amountPaid: number;
};

export type UserBillSummary = {
  currency: string;
  total: number;
  itemCount: number;
  /** Sum of payment-proof amounts; used for Settled / Open on My bills. */
  paidTotal?: number;
  /**
   * Per-person paid totals from transfer proofs. Shown on My bills shared
   * links instead of remaining-left. Omitted on older index rows.
   */
  payers?: UserBillPayer[];
  receiptUrl?: string;
};

export type UserBillLink = UserBillSummary & {
  shareId: string;
  role: UserBillRole;
  createdAt: number;
  updatedAt: number;
};

export type UserBillsResponse = {
  shared: UserBillLink[];
  received: UserBillLink[];
};
