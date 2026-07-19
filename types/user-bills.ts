export type UserBillRole = "shared" | "received";

export type UserBillSummary = {
  currency: string;
  total: number;
  itemCount: number;
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
