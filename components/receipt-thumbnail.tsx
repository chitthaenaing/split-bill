"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Receipt, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ReceiptThumbnail({
  src,
  className,
}: {
  src: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!src) return null;

  return (
    <>
      <Card
        className={cn(
          "overflow-hidden p-0 hidden lg:block",
          className
        )}
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-medium">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          Receipt
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full bg-muted/40 max-h-[60vh] overflow-hidden"
          aria-label="View receipt fullscreen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Receipt"
            className="w-full h-auto object-contain"
          />
        </button>
      </Card>

      {/* Mobile: collapsible button at top */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full bg-muted border border-border transition-colors"
      >
        <Receipt className="h-3.5 w-3.5" />
        View receipt
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <button
              type="button"
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <motion.img
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
              transition={{ duration: 0.2 }}
              src={src}
              alt="Receipt"
              className="max-h-full max-w-full rounded-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
