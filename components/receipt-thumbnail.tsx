"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Download, QrCode, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  downloadImageFile,
  prefersShareToPhotoLibrary,
} from "@/lib/download-file";
import { cn } from "@/lib/utils";

function isPaymentQrTitle(title: string): boolean {
  const t = title.toLowerCase();
  return (
    t.includes("qr") ||
    t.includes("pay me") ||
    t.includes("promptpay")
  );
}

/** Short label for the mobile pill (not generic “View image”). */
function defaultMobileActionLabel(title: string): string {
  return isPaymentQrTitle(title) ? "Scan to pay" : "See the bill";
}

export function ReceiptThumbnail({
  src,
  className,
  title = "Bill receipt",
  mobileActionLabel,
  downloadable = false,
  downloadBaseName,
  downloadMimeType,
}: {
  src: string | null;
  className?: string;
  /** Card / lightbox heading. */
  title?: string;
  /** Override the mobile chip label (defaults from `title`). */
  mobileActionLabel?: string;
  downloadable?: boolean;
  downloadBaseName?: string;
  downloadMimeType?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const qr = isPaymentQrTitle(title);
  const HeaderIcon = qr ? QrCode : Receipt;
  const mobileLabel = mobileActionLabel ?? defaultMobileActionLabel(title);
  const MobileIcon = qr ? QrCode : Receipt;
  const actionIdleLabel = saveToLibrary ? "Save" : "Download";
  const actionBusyLabel = saveToLibrary ? "Saving..." : "Downloading...";
  const actionAria = saveToLibrary
    ? `Save ${title} to photo library`
    : `Download ${title}`;

  useEffect(() => {
    setSaveToLibrary(prefersShareToPhotoLibrary());
  }, []);

  const onDownload = useCallback(async () => {
    if (!src || downloading) return;
    setDownloading(true);
    try {
      await downloadImageFile({
        src,
        baseName: downloadBaseName ?? title,
        mimeType: downloadMimeType,
      });
    } finally {
      setDownloading(false);
    }
  }, [downloadBaseName, downloadMimeType, downloading, src, title]);

  if (!src) return null;

  return (
    <>
      <Card
        className={cn(
          "overflow-hidden p-0 hidden lg:block",
          className
        )}
      >
        <div className="px-5 py-3 border-b border-border/70 flex items-center gap-2 text-sm font-medium">
          <HeaderIcon className="h-4 w-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {downloadable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3"
              onClick={(e) => {
                e.stopPropagation();
                void onDownload();
              }}
              disabled={downloading}
              aria-label={actionAria}
            >
              <Download className="h-4 w-4" />
              {downloading ? actionBusyLabel : actionIdleLabel}
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full bg-muted/40 max-h-[60vh] overflow-hidden"
          aria-label={`Open ${title} fullscreen`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={title}
            className="w-full h-auto object-contain"
          />
        </button>
      </Card>

      {/* Mobile: collapsible button at top */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg bg-muted/80 border border-border/80 transition-colors"
      >
        <MobileIcon className="h-3.5 w-3.5" />
        {mobileLabel}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="receipt-lightbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-100 flex min-h-0 items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
              >
                <button
                  type="button"
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
                {downloadable ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute left-4 top-4 bg-white/10 text-white hover:bg-white/20 border-white/15"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDownload();
                    }}
                    disabled={downloading}
                    aria-label={actionAria}
                  >
                    <Download className="h-4 w-4" />
                    {downloading ? actionBusyLabel : actionIdleLabel}
                  </Button>
                ) : null}
                <motion.img
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  src={src}
                  alt={title}
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
