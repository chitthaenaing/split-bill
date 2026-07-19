/** Signed-in user profile fields stored at `users/{uid}` in Firestore. */
export type UserPaymentQrProfile = {
  paymentQrUrl: string;
  paymentQrContentType: string;
  paymentQrUpdatedAt: number;
};

export type UserProfile = {
  paymentQrUrl?: string;
  paymentQrContentType?: string;
  paymentQrUpdatedAt?: number;
};
