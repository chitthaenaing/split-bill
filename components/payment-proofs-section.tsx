"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
        const imageDataUrl = await fileToDataUrl(file);
        const res = await fetch(`/api/share/${shareId}/payment-receipt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageDataUrl }),
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
    [shareId, router]
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
            After you pay, upload a screenshot of the transfer so whoever shared
            the bill can confirm it.
          </p>

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
              disabled={busy}
              onClick={() => fileRef.current?.click()}
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
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {receipts.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setLightboxUrl(r.url)}
                    className="shrink-0 w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.url}
                      alt="Payment proof"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {lightboxUrl && (
              <motion.div
                key="proof-lightbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setLightboxUrl(null)}
                className="fixed inset-0 z-100 flex min-h-0 items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
              >
                <button
                  type="button"
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Close"
                  onClick={() => setLightboxUrl(null)}
                >
                  <X className="h-5 w-5" />
                </button>
                <motion.img
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  src={lightboxUrl}
                  alt="Payment proof"
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
