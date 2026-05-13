"use client";

import { useCallback, useRef, useState } from "react";
import { QrCode, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useBillStore } from "@/lib/store";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function BankingQrPanel() {
  const bankingQrDataUrl = useBillStore((s) => s.bankingQrDataUrl);
  const setBankingQrDataUrl = useBillStore((s) => s.setBankingQrDataUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image (JPG, PNG, etc.).");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("Image must be 8 MB or smaller.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(f);
      setBankingQrDataUrl(dataUrl);
    } catch {
      setError("Could not read that file.");
    }
    e.target.value = "";
  }, [setBankingQrDataUrl]);

  const clear = useCallback(() => {
    setError(null);
    setBankingQrDataUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [setBankingQrDataUrl]);

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-medium">
        <QrCode className="h-4 w-4 text-muted-foreground" />
        Payment QR
      </div>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Add a photo of your PromptPay or bank QR. It is bundled into the share
          link so people paying you can scan it, then attach a transfer
          screenshot on that same link.
        </p>

        {!bankingQrDataUrl ? (
          <label
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 cursor-pointer transition-colors",
              "hover:border-accent/40 hover:bg-accent/5"
            )}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Tap to add QR image</span>
            <span className="text-[11px] text-muted-foreground">
              JPG, PNG — up to 8 MB
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onPick}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-muted border border-border max-h-48 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bankingQrDataUrl}
                alt="Your payment QR"
                className="max-h-48 w-full object-contain"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Replace
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={clear}
                aria-label="Remove QR image"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onPick}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
