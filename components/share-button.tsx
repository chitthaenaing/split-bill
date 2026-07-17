"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotifyToggle } from "@/components/notify-toggle";
import { useBillStore } from "@/lib/store";
import { itemsTotal } from "@/lib/calc";

type ShareResponse = { id: string; url: string } | { error: string };

export function ShareButton() {
  const items = useBillStore((s) => s.items);
  const currency = useBillStore((s) => s.currency);
  const tax = useBillStore((s) => s.tax);
  const serviceCharge = useBillStore((s) => s.serviceCharge);
  const rounding = useBillStore((s) => s.rounding);
  const receiptDataUrl = useBillStore((s) => s.receiptDataUrl);
  const bankingQrDataUrl = useBillStore((s) => s.bankingQrDataUrl);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  const disabled = !receiptDataUrl || items.length === 0;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const start = useCallback(async () => {
    if (!receiptDataUrl) {
      setError("No receipt image to share.");
      setOpen(true);
      return;
    }
    setOpen(true);
    setBusy(true);
    setError(null);
    setUrl(null);
    setShareId(null);
    try {
      const subtotal = itemsTotal(items);
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: receiptDataUrl,
          ...(bankingQrDataUrl ? { bankingQrDataUrl } : {}),
          bill: {
            currency,
            items: items.map((it) => ({
              name: it.name,
              price: it.price,
              quantity: it.quantity,
            })),
            tax,
            serviceCharge,
            rounding,
            discount: 0,
            subtotal,
            total: subtotal + tax + serviceCharge + rounding,
          },
        }),
      });
      const data = (await res.json()) as ShareResponse;
      if (!res.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : `Request failed (${res.status})`
        );
      }
      setUrl(data.url);
      setShareId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [items, currency, tax, serviceCharge, rounding, receiptDataUrl, bankingQrDataUrl]);

  const close = () => {
    setOpen(false);
    setCopied(false);
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={start}
        disabled={disabled || busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        Share link
      </Button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={close}
                className="fixed inset-0 z-9999 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
              >
                <motion.div
                  initial={{ scale: 0.96, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 4 }}
                  transition={{ duration: 0.18 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">
                        Share your bill
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Anyone with this link can open the receipt and pick
                        their own items.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={close}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4 px-6 pb-6">
                    {busy && (
                      <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading receipt and creating link…
                      </div>
                    )}

                    {error && (
                      <div className="flex items-start gap-2.5 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="flex-1">{error}</span>
                      </div>
                    )}

                    {url && (
                      <>
                        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 px-3.5 py-2.5">
                          <span className="flex-1 select-all truncate font-mono text-sm">
                            {url}
                          </span>
                          <button
                            type="button"
                            onClick={copy}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-foreground hover:text-background"
                          >
                            {copied ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => window.open(url, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </Button>
                          <Button
                            variant="accent"
                            size="sm"
                            className="flex-1"
                            onClick={copy}
                          >
                            {copied ? (
                              <>
                                <Check className="h-4 w-4" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4" />
                                Copy link
                              </>
                            )}
                          </Button>
                        </div>

                        {shareId && (
                          <div className="border-t border-border pt-4">
                            <NotifyToggle shareId={shareId} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
