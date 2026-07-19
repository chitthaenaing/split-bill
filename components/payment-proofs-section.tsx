"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  imageFileFromDataTransfer,
  isEditablePasteTarget,
} from "@/lib/clipboard-image";
import { dataUrlToBlob, prepareReceiptImage } from "@/lib/image-prep";
import { computePaymentBalance } from "@/lib/payment-balance";
import { readJsonResponse } from "@/lib/read-json-response";
import {
  forgetMyProof,
  loadMyProofs,
  loadOwnerToken,
  rememberMyProof,
  type MyProofEntry,
} from "@/lib/share-client";
import { cn, formatMoney } from "@/lib/utils";
import type { StoredBill, StoredPaymentReceipt } from "@/types/bill";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function UploadDropzone({
  busy,
  onChooseFile,
  onImageFile,
  error,
}: {
  busy: boolean;
  onChooseFile: () => void;
  onImageFile: (file: File) => void;
  error: string | null;
}) {
  const [dragActive, setDragActive] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (busy) return;
    const file =
      imageFileFromDataTransfer(e.dataTransfer) ??
      e.dataTransfer.files?.[0] ??
      null;
    if (file) onImageFile(file);
  };

  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label="Upload transfer screenshot. Choose a file, drop an image, or paste from the clipboard."
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
          dragActive
            ? "border-accent bg-accent/10"
            : "border-border bg-muted/15"
        )}
      >
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={busy}
          onClick={onChooseFile}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {busy ? "Reading slip…" : "Choose screenshot"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {dragActive
            ? "Drop to upload"
            : "Drop or paste a screenshot — we’ll read the amount and name"}
        </span>
      </div>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

export function PaymentProofsSection({
  shareId,
  currency,
  bill,
  receipts: initialReceipts,
}: {
  shareId: string;
  currency: string;
  bill: Pick<
    StoredBill,
    "items" | "tax" | "serviceCharge" | "rounding" | "discount"
  >;
  receipts: StoredPaymentReceipt[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<StoredPaymentReceipt[]>(
    initialReceipts
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [myProofs, setMyProofs] = useState<MyProofEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [lightbox, setLightbox] = useState<{
    url: string;
    payerName?: string;
    amountPaid?: number;
  } | null>(null);

  useEffect(() => {
    setMyProofs(loadMyProofs(shareId));
    setHydrated(true);
  }, [shareId]);

  const mine = useCallback(
    (id: string) => hydrated && myProofs.some((p) => p.id === id),
    [hydrated, myProofs]
  );

  const deleteTokenFor = useCallback(
    (id: string) => myProofs.find((p) => p.id === id)?.deleteToken,
    [myProofs]
  );

  const balance = useMemo(
    () => computePaymentBalance(bill, receipts),
    [bill, receipts]
  );

  const hasReceipts = receipts.length > 0;

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError("Image must be 8 MB or smaller.");
        return;
      }
      setBusy(true);
      try {
        const rawDataUrl = await fileToDataUrl(file);
        const prepared = await prepareReceiptImage(rawDataUrl);
        const form = new FormData();
        form.append("file", dataUrlToBlob(prepared), file.name || "proof.jpg");

        const res = await fetch(`/api/share/${shareId}/payment-receipt`, {
          method: "POST",
          body: form,
        });
        const data = await readJsonResponse<{
          ok?: boolean;
          error?: string;
          receiptId?: string;
          deleteToken?: string;
          paymentReceipts?: StoredPaymentReceipt[];
        }>(res);
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
        if (Array.isArray(data.paymentReceipts)) {
          setReceipts(data.paymentReceipts);
        }
        if (data.receiptId) {
          setMyProofs(
            rememberMyProof(shareId, {
              id: data.receiptId,
              ...(data.deleteToken ? { deleteToken: data.deleteToken } : {}),
            })
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [shareId]
  );

  // Allow Cmd/Ctrl+V (and mobile paste) anywhere on the share page when the
  // user isn't typing in a field — common after copying a bank screenshot.
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (busy) return;
      if (isEditablePasteTarget(e.target)) return;
      const file = imageFileFromDataTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void upload(file);
    };
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [busy, upload]);

  const onDelete = useCallback(
    async (receiptId: string) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Delete your transfer proof?")
      ) {
        return;
      }
      setError(null);
      setDeletingId(receiptId);
      try {
        const deleteToken = deleteTokenFor(receiptId);
        const ownerToken = loadOwnerToken(shareId);
        const res = await fetch(`/api/share/${shareId}/payment-receipt`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            receiptId,
            ...(deleteToken ? { deleteToken } : {}),
            ...(ownerToken ? { ownerToken } : {}),
          }),
        });
        const data = await readJsonResponse<{
          ok?: boolean;
          error?: string;
          paymentReceipts?: StoredPaymentReceipt[];
        }>(res);
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Delete failed (${res.status})`);
        }
        if (Array.isArray(data.paymentReceipts)) {
          setReceipts(data.paymentReceipts);
        }
        setMyProofs(forgetMyProof(shareId, receiptId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed.");
      } finally {
        setDeletingId(null);
      }
    },
    [shareId, deleteTokenFor]
  );

  const triggerFileDialog = useCallback(() => {
    setError(null);
    fileRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) await upload(f);
    },
    [upload]
  );

  const remainingLabel =
    balance.remaining <= 0.005
      ? "Settled"
      : `${formatMoney(balance.remaining, currency)} left`;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border/70 flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          {hasReceipts ? "Payments" : "Your transfer"}
        </div>
        <CardContent className="p-4 sm:p-5 space-y-4">
          {!hasReceipts ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pay the organiser, then drop or paste the bank app screenshot. We
              scan it for the amount and sender — nothing to type.
            </p>
          ) : null}

          {hasReceipts ? (
            <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-3 space-y-2.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Bill total</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(balance.billTotal, currency)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(balance.paidTotal, currency)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border/70 pt-2.5 text-sm">
                <span className="font-medium text-foreground">Remaining</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    balance.remaining <= 0.005
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  {remainingLabel}
                </span>
              </div>
              {balance.byPayer.length > 0 ? (
                <ul className="space-y-1 border-t border-border/70 pt-2.5">
                  {balance.byPayer.map((row) => (
                    <li
                      key={row.payerName}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <span className="truncate text-muted-foreground">
                        {row.payerName}
                        {row.proofCount > 1 ? ` ×${row.proofCount}` : ""}
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {row.amountPaid > 0
                          ? formatMoney(row.amountPaid, currency)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {balance.hasUnknownAmounts ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Some older proofs have no scanned amount — remaining may look
                  high until those are re-uploaded.
                </p>
              ) : null}
            </div>
          ) : null}

          {hasReceipts ? (
            <ul className="space-y-2.5">
              {receipts.map((r) => {
                const label = (r.payerName ?? "").trim() || "Transfer";
                const isMine = mine(r.id);
                const isDeleting = deletingId === r.id;
                const amountLabel =
                  typeof r.amountPaid === "number" && r.amountPaid > 0
                    ? formatMoney(r.amountPaid, currency)
                    : null;
                return (
                  <li key={r.id} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          url: r.url,
                          payerName: r.payerName,
                          amountPaid: r.amountPaid,
                        })
                      }
                      className="flex w-full gap-3 rounded-xl border border-border bg-muted/20 p-2.5 text-left transition-colors hover:bg-muted/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.url}
                          alt={`Transfer screenshot: ${label}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div
                        className={cn(
                          "flex min-w-0 flex-1 flex-col justify-center gap-0.5",
                          isMine && "pr-9"
                        )}
                      >
                        <span className="truncate text-sm font-semibold text-foreground">
                          {label}
                        </span>
                        {amountLabel ? (
                          <span className="text-sm tabular-nums text-foreground">
                            {amountLabel}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            Amount not scanned
                          </span>
                        )}
                        {isMine ? (
                          <span className="text-[11px] text-muted-foreground">
                            You uploaded this
                          </span>
                        ) : null}
                      </div>
                    </button>
                    {isMine ? (
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        disabled={isDeleting}
                        aria-label="Delete your transfer proof"
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {!hasReceipts ? (
            <UploadDropzone
              busy={busy}
              onChooseFile={triggerFileDialog}
              onImageFile={upload}
              error={error}
            />
          ) : (
            <details className="group rounded-xl border border-border bg-muted/15">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span>Add another transfer</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border px-3 py-3">
                <UploadDropzone
                  busy={busy}
                  onChooseFile={triggerFileDialog}
                  onImageFile={upload}
                  error={error}
                />
              </div>
            </details>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={onFileSelected}
          />
        </CardContent>
      </Card>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {lightbox && (
              <motion.div
                key="proof-lightbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setLightbox(null)}
                className="fixed inset-0 z-100 flex min-h-0 flex-col items-center justify-center gap-3 bg-black/80 p-4 backdrop-blur-sm"
              >
                <button
                  type="button"
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Close"
                  onClick={() => setLightbox(null)}
                >
                  <X className="h-5 w-5" />
                </button>
                <motion.img
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  src={lightbox.url}
                  alt={
                    lightbox.payerName
                      ? `Transfer from ${lightbox.payerName}`
                      : "Transfer screenshot"
                  }
                  className="max-h-[min(72dvh,100%)] max-w-full rounded-2xl object-contain shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
                {(lightbox.payerName ?? "").trim() ||
                (typeof lightbox.amountPaid === "number" &&
                  lightbox.amountPaid > 0) ? (
                  <p className="max-w-[min(100%,28rem)] text-center text-base font-semibold text-white">
                    {(lightbox.payerName ?? "").trim() || "Transfer"}
                    {typeof lightbox.amountPaid === "number" &&
                    lightbox.amountPaid > 0
                      ? ` · ${formatMoney(lightbox.amountPaid, currency)}`
                      : ""}
                  </p>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
