"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
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

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      const name = payerName.trim();
      if (!name) {
        setError("Enter your name first so the bill owner knows who paid.");
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

  const onInputChange = useCallback(
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
          Payment receipts
        </div>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            After you pay, add your name and upload a screenshot of the transfer
            so whoever shared the bill can match it to you.
          </p>

          <div className="space-y-1.5">
            <label htmlFor={`payer-name-${shareId}`} className="text-xs font-medium text-foreground">
              Your name
            </label>
            <Input
              id={`payer-name-${shareId}`}
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={80}
              disabled={busy}
              autoComplete="name"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={onInputChange}
            />
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={busy || !payerName.trim()}
              onClick={() => {
                if (!payerName.trim()) {
                  setError("Enter your name first so the bill owner knows who paid.");
                  return;
                }
                fileRef.current?.click();
              }}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload proof
            </Button>
          </div>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}

          {receipts.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-2">
                Uploaded proofs ({receipts.length})
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {receipts.map((r) => (
                  <div
                    key={r.id}
                    className="shrink-0 flex flex-col items-center gap-1 w-[5.75rem]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          url: r.url,
                          payerName: r.payerName,
                        })
                      }
                      className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.url}
                        alt={r.payerName ? `Payment proof from ${r.payerName}` : "Payment proof"}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <span
                      className="text-[10px] leading-tight text-center text-muted-foreground w-full line-clamp-2 break-words"
                      title={r.payerName || "Name not recorded"}
                    >
                      {r.payerName ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                {lightbox.payerName ? (
                  <p className="max-w-[min(100%,28rem)] text-center text-sm font-medium text-white/95 shrink-0">
                    {lightbox.payerName}
                  </p>
                ) : null}
                <motion.img
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  src={lightbox.url}
                  alt={
                    lightbox.payerName
                      ? `Payment proof from ${lightbox.payerName}`
                      : "Payment proof"
                  }
                  className="max-h-[min(100dvh,100%)] max-w-full rounded-2xl object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
