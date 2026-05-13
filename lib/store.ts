import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BillItem, ExtractedBill } from "@/types/bill";
import { uid } from "@/lib/utils";

type State = {
  receiptDataUrl: string | null;
  /** Optional PromptPay / bank QR image (data URL) included when sharing. */
  bankingQrDataUrl: string | null;
  currency: string;
  items: BillItem[];
  tax: number;
  serviceCharge: number;
  rounding: number;
};

type Actions = {
  loadFromExtraction: (b: ExtractedBill, receiptDataUrl: string | null) => void;
  setBankingQrDataUrl: (dataUrl: string | null) => void;

  /** Tap whole row: cycle 0 ↔ full quantity. */
  toggleItem: (id: string) => void;
  setSelectedQuantity: (id: string, n: number) => void;
  incSelected: (id: string) => void;
  decSelected: (id: string) => void;

  selectAll: () => void;
  clearSelection: () => void;

  setTax: (n: number) => void;
  setServiceCharge: (n: number) => void;
  setRounding: (n: number) => void;

  reset: () => void;
};

const initial: State = {
  receiptDataUrl: null,
  bankingQrDataUrl: null,
  currency: "USD",
  items: [],
  tax: 0,
  serviceCharge: 0,
  rounding: 0,
};

function clampSelected(it: BillItem, n: number): number {
  const q = Math.max(0, Math.floor(it.quantity || 0));
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return Math.min(v, q);
}

export const useBillStore = create<State & Actions>()(
  persist(
    (set) => ({
      ...initial,

      loadFromExtraction: (b, receiptDataUrl) => {
        set({
          receiptDataUrl,
          bankingQrDataUrl: null,
          currency: b.currency || "USD",
          tax: b.tax || 0,
          serviceCharge: b.serviceCharge || 0,
          rounding: b.rounding || 0,
          items: (b.items || []).map((it) => ({
            id: uid("itm"),
            name: it.name,
            price: it.price,
            quantity: Math.max(1, it.quantity || 1),
            selectedQuantity: 0,
          })),
        });
      },

      toggleItem: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id
              ? {
                  ...it,
                  selectedQuantity:
                    it.selectedQuantity > 0 ? 0 : it.quantity,
                }
              : it
          ),
        })),

      setSelectedQuantity: (id, n) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id
              ? { ...it, selectedQuantity: clampSelected(it, n) }
              : it
          ),
        })),

      incSelected: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id
              ? {
                  ...it,
                  selectedQuantity: clampSelected(
                    it,
                    it.selectedQuantity + 1
                  ),
                }
              : it
          ),
        })),

      decSelected: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id
              ? {
                  ...it,
                  selectedQuantity: clampSelected(
                    it,
                    it.selectedQuantity - 1
                  ),
                }
              : it
          ),
        })),

      selectAll: () =>
        set((s) => ({
          items: s.items.map((it) => ({
            ...it,
            selectedQuantity: it.quantity,
          })),
        })),

      clearSelection: () =>
        set((s) => ({
          items: s.items.map((it) => ({ ...it, selectedQuantity: 0 })),
        })),

      setTax: (n) => set({ tax: Number.isFinite(n) ? Math.max(0, n) : 0 }),
      setServiceCharge: (n) =>
        set({ serviceCharge: Number.isFinite(n) ? Math.max(0, n) : 0 }),
      setRounding: (n) =>
        set({ rounding: Number.isFinite(n) ? n : 0 }),

      reset: () => set({ ...initial }),

      setBankingQrDataUrl: (dataUrl) =>
        set({ bankingQrDataUrl: dataUrl && dataUrl.length > 0 ? dataUrl : null }),
    }),
    {
      name: "bill-split",
      version: 4,
      partialize: (s) => ({
        receiptDataUrl: s.receiptDataUrl,
        bankingQrDataUrl: s.bankingQrDataUrl,
        currency: s.currency,
        items: s.items,
        tax: s.tax,
        serviceCharge: s.serviceCharge,
        rounding: s.rounding,
      }),
      migrate: (persistedState: unknown, version: number): State => {
        type LegacyItem = {
          id?: string;
          name?: string;
          price?: number;
          quantity?: number;
          selected?: boolean;
          selectedQuantity?: number;
        };
        type LegacyState = Omit<Partial<State>, "items"> & {
          items?: LegacyItem[];
        };
        const s = (persistedState ?? {}) as LegacyState;
        if (version < 3) {
          const items: BillItem[] = (s.items ?? []).map((it) => {
            const quantity = Math.max(1, it.quantity ?? 1);
            const rawSelected =
              typeof it.selectedQuantity === "number"
                ? it.selectedQuantity
                : it.selected
                ? quantity
                : 0;
            const selectedQuantity = clampSelected(
              { quantity } as BillItem,
              rawSelected
            );
            return {
              id: it.id ?? uid("itm"),
              name: it.name ?? "",
              price: it.price ?? 0,
              quantity,
              selectedQuantity,
            };
          });
          return { ...initial, ...s, items } as State;
        }
        return {
          ...initial,
          ...s,
          items: (s.items ?? []) as BillItem[],
          bankingQrDataUrl: s.bankingQrDataUrl ?? null,
        } as State;
      },
    }
  )
);
