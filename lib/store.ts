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
  /** Bill-level discount / promotion (positive amount off). */
  discount: number;
  /** Printed subtotal from the receipt (for reconciliation UI). */
  printedSubtotal: number | null;
  /** Printed grand total from the receipt (for reconciliation UI). */
  printedTotal: number | null;
  /** Arithmetic warnings left after extraction / repair. */
  extractionWarnings: string[];
};

type Actions = {
  loadFromExtraction: (
    b: ExtractedBill,
    receiptDataUrl: string | null,
    meta?: { warnings?: string[]; reconciled?: boolean }
  ) => void;
  setBankingQrDataUrl: (dataUrl: string | null) => void;
  clearExtractionWarnings: () => void;

  /** Tap whole row: cycle 0 ↔ full quantity. */
  toggleItem: (id: string) => void;
  setSelectedQuantity: (id: string, n: number) => void;
  incSelected: (id: string) => void;
  decSelected: (id: string) => void;

  /** How many people split this line. Clamped to ≥ 1. */
  setSplitCount: (id: string, n: number) => void;
  incSplit: (id: string) => void;
  decSplit: (id: string) => void;

  selectAll: () => void;
  clearSelection: () => void;

  setTax: (n: number) => void;
  setServiceCharge: (n: number) => void;
  setRounding: (n: number) => void;
  setDiscount: (n: number) => void;

  /** Correct a mis-read line (name and/or printed line total). */
  updateItem: (
    id: string,
    patch: { name?: string; price?: number; quantity?: number }
  ) => void;
  /** Add a line the extractor missed (e.g. a non-Latin menu name). */
  addItem: (item?: {
    name?: string;
    price?: number;
    quantity?: number;
  }) => string;
  removeItem: (id: string) => void;

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
  discount: 0,
  printedSubtotal: null,
  printedTotal: null,
  extractionWarnings: [],
};

function clampSelected(it: BillItem, n: number): number {
  const q = Math.max(0, Math.floor(it.quantity || 0));
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return Math.min(v, q);
}

function clampSplit(n: number): number {
  return Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));
}

export const useBillStore = create<State & Actions>()(
  persist(
    (set) => ({
      ...initial,

      loadFromExtraction: (b, receiptDataUrl, meta) => {
        set({
          receiptDataUrl,
          bankingQrDataUrl: null,
          currency: b.currency || "USD",
          tax: b.tax || 0,
          serviceCharge: b.serviceCharge || 0,
          rounding: b.rounding || 0,
          discount: Math.max(0, b.discount || 0),
          printedSubtotal:
            typeof b.subtotal === "number" && Number.isFinite(b.subtotal)
              ? b.subtotal
              : null,
          printedTotal:
            typeof b.total === "number" && Number.isFinite(b.total)
              ? b.total
              : null,
          extractionWarnings:
            meta?.reconciled === false
              ? meta.warnings ?? []
              : meta?.warnings?.length
              ? meta.warnings
              : [],
          items: (b.items || []).map((it) => ({
            id: uid("itm"),
            name: it.name,
            price: it.price,
            quantity: Math.max(1, it.quantity || 1),
            selectedQuantity: 0,
            splitCount: 1,
          })),
        });
      },

      clearExtractionWarnings: () => set({ extractionWarnings: [] }),

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

      setSplitCount: (id, n) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, splitCount: clampSplit(n) } : it
          ),
        })),

      incSplit: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id
              ? { ...it, splitCount: clampSplit(it.splitCount + 1) }
              : it
          ),
        })),

      decSplit: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id
              ? { ...it, splitCount: clampSplit(it.splitCount - 1) }
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
      setDiscount: (n) =>
        set({ discount: Number.isFinite(n) ? Math.max(0, n) : 0 }),

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) => {
            if (it.id !== id) return it;
            const next: BillItem = { ...it };
            if (typeof patch.name === "string") {
              next.name = patch.name.slice(0, 200);
            }
            if (typeof patch.price === "number" && Number.isFinite(patch.price)) {
              next.price = patch.price;
            }
            if (
              typeof patch.quantity === "number" &&
              Number.isFinite(patch.quantity)
            ) {
              next.quantity = Math.max(1, Math.floor(patch.quantity));
              next.selectedQuantity = clampSelected(
                next,
                next.selectedQuantity
              );
            }
            return next;
          }),
        })),

      addItem: (item) => {
        const id = uid("itm");
        const quantity = Math.max(1, Math.floor(item?.quantity ?? 1) || 1);
        const price =
          typeof item?.price === "number" && Number.isFinite(item.price)
            ? item.price
            : 0;
        const name = (item?.name ?? "New item").trim().slice(0, 200) || "New item";
        set((s) => ({
          items: [
            ...s.items,
            {
              id,
              name,
              price,
              quantity,
              selectedQuantity: 0,
              splitCount: 1,
            },
          ],
        }));
        return id;
      },

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((it) => it.id !== id) })),

      reset: () => set({ ...initial }),

      setBankingQrDataUrl: (dataUrl) =>
        set({ bankingQrDataUrl: dataUrl && dataUrl.length > 0 ? dataUrl : null }),
    }),
    {
      name: "bill-split",
      version: 7,
      partialize: (s) => ({
        receiptDataUrl: s.receiptDataUrl,
        bankingQrDataUrl: s.bankingQrDataUrl,
        currency: s.currency,
        items: s.items,
        tax: s.tax,
        serviceCharge: s.serviceCharge,
        rounding: s.rounding,
        discount: s.discount,
        printedSubtotal: s.printedSubtotal,
        printedTotal: s.printedTotal,
        extractionWarnings: s.extractionWarnings,
      }),
      migrate: (persistedState: unknown, version: number): State => {
        type LegacyItem = {
          id?: string;
          name?: string;
          price?: number;
          quantity?: number;
          selected?: boolean;
          selectedQuantity?: number;
          splitCount?: number;
        };
        type LegacyState = Omit<Partial<State>, "items"> & {
          items?: LegacyItem[];
          discount?: number;
          printedSubtotal?: number | null;
          printedTotal?: number | null;
          extractionWarnings?: string[];
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
              splitCount: clampSplit(it.splitCount ?? 1),
            };
          });
          return {
            ...initial,
            ...s,
            items,
            discount: Math.max(0, s.discount ?? 0),
            printedSubtotal: s.printedSubtotal ?? null,
            printedTotal: s.printedTotal ?? null,
            extractionWarnings: s.extractionWarnings ?? [],
          } as State;
        }
        return {
          ...initial,
          ...s,
          items: (s.items ?? []).map((it) => ({
            id: it.id ?? uid("itm"),
            name: it.name ?? "",
            price: it.price ?? 0,
            quantity: Math.max(1, it.quantity ?? 1),
            selectedQuantity: it.selectedQuantity ?? 0,
            splitCount: clampSplit(it.splitCount ?? 1),
          })) as BillItem[],
          bankingQrDataUrl: s.bankingQrDataUrl ?? null,
          discount: Math.max(0, s.discount ?? 0),
          printedSubtotal: s.printedSubtotal ?? null,
          printedTotal: s.printedTotal ?? null,
          extractionWarnings: s.extractionWarnings ?? [],
        } as State;
      },
    }
  )
);
