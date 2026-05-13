"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StoredPaymentReceipt } from "@/types/bill";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function NameAndUploadButton({
  shareId,
  busy,
  payerName,
  setPayerName,
  onChooseFile,
  error,
  setError,
}: {
  shareId: string;
  busy: boolean;
  payerName: string;
  setPayerName: (v: string) => void;
  onChooseFile: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label
          htmlFor={`payer-name-${shareId}`}
          className="text-xs font-medium text-foreground"
        >
          Name on this transfer
        </label>
        <Input
          id={`payer-name-${shareId}`}
          value={payerName}
          onChange={(e) => {
            setPayerName(e.target.value);
            setError(null);
          }}
          placeholder="Who paid?"
          maxLength={80}
          disabled={busy}
          autoComplete="name"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={busy || !payerName.trim()}
          onClick={onChooseFile}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Choose screenshot
        </Button>
      </div>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

export function PaymentProofsSection({
  shareId,
  receipts,
}: {
  shareId: string;
  receipts: StoredPaymentReceipt[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [payerName, setPayerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    url: string;
    payerName?: string;
  } | null>(null);

  const hasReceipts = receipts.length > 0;

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      const name = payerName.trim();
      if (!name) {
        setError("Add who paid, then choose the transfer screenshot.");
        return;
      }
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
        const imageDataUrl = await fileToDataUrl(file);
        const res = await fetch(`/api/share/${shareId}/payment-receipt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageDataUrl, payerName: name }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Upload failed (${res.status})`);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [shareId, router, payerName]
  );

  const triggerFileDialog = useCallback(() => {
    if (!payerName.trim()) {
      setError("Add who paid, then choose the transfer screenshot.");
      return;
    }
    setError(null);
    fileRef.current?.click();
  }, [payerName]);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) await upload(f);
    },
    [upload]
  );

  return (
    <>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          {hasReceipts ? "Transfer proofs" : "Your transfer"}
        </div>
        <CardContent className="p-4 space-y-4">
          {!hasReceipts ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pay the organiser, then attach the bank app screenshot and the name
              that should appear on the bill.
            </p>
          ) : null}

          {hasReceipts ? (
            <ul className="space-y-2.5">
              {receipts.map((r) => {
                const label = (r.payerName ?? "").trim() || "Transfer";
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          url: r.url,
                          payerName: r.payerName,
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
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {!hasReceipts ? (
            <NameAndUploadButton
              shareId={shareId}
              busy={busy}
              payerName={payerName}
              setPayerName={setPayerName}
              onChooseFile={triggerFileDialog}
              error={error}
              setError={setError}
            />
          ) : (
            <details className="group rounded-xl border border-border bg-muted/15">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span>Add another transfer</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border px-3 py-3">
                <NameAndUploadButton
                  shareId={shareId}
                  busy={busy}
                  payerName={payerName}
                  setPayerName={setPayerName}
                  onChooseFile={triggerFileDialog}
                  error={error}
                  setError={setError}
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
                {(lightbox.payerName ?? "").trim() ? (
                  <p className="max-w-[min(100%,28rem)] text-center text-base font-semibold text-white">
                    {(lightbox.payerName ?? "").trim()}
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
