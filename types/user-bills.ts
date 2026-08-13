export type UserBillRole = "shared" | "received";

export type UserBillSummary = {
  currency: string;
  total: number;
  itemCount: number;
  /** Sum of payment-proof amounts; used for Settled / Open on My bills. */
  paidTotal?: number;
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
