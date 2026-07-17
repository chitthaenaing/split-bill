"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImageUp, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dataUrlToBlob, prepareReceiptImage } from "@/lib/image-prep";
import { readJsonResponse } from "@/lib/read-json-response";
import { useBillStore } from "@/lib/store";
import type { ExtractionResponse } from "@/types/bill";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function UploadCard() {
  const loadFromExtraction = useBillStore((s) => s.loadFromExtraction);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(async (f: File) => {
    setError(null);
    if (!f.type.startsWith("image/")) {
      setError("Please pick an image file (JPG, PNG, HEIC, etc).");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("That image is over 8 MB. Try a smaller one.");
      return;
    }
    const dataUrl = await fileToDataUrl(f);
    setFile(f);
    setPreview(dataUrl);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) await accept(f);
    },
    [accept]
  );

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) await accept(f);
    },
    [accept]
  );

  const clear = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const extract = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      // Compress client-side, then send as multipart so we stay under the
      // serverless body limit (JSON base64 was ~33% larger and often 413'd
      // on phone photos — Safari then showed a cryptic pattern error).
      const imageDataUrl = await prepareReceiptImage(preview);
      const blob = dataUrlToBlob(imageDataUrl);
      const form = new FormData();
      form.append("file", blob, file?.name || "receipt.jpg");

      const res = await fetch("/api/extract", {
        method: "POST",
        body: form,
      });
      const data = await readJsonResponse<ExtractionResponse | { error: string }>(
        res
      );
      if (!res.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : `Request failed (${res.status})`
        );
      }
      loadFromExtraction(data.bill, preview, {
        warnings: data.warnings,
        reconciled: data.reconciled,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [preview, file, loadFromExtraction]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-2xl"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium mb-4 ring-1 ring-accent/20">
          <Sparkles className="h-3 w-3" />
          Powered by AI vision
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          Just pay for what you ate.
        </h1>
        <p className="mt-3 text-muted-foreground max-w-md mx-auto">
          Drop in a photo of your receipt, pick the items you had, and we&apos;ll
          do the maths — tax and service included.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          {!preview ? (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/40 px-6 py-14 sm:py-20 cursor-pointer transition-all",
                "hover:border-accent/40 hover:bg-accent/5",
                dragging && "border-accent bg-accent/10"
              )}
            >
              <span className="h-14 w-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                <ImageUp className="h-7 w-7" />
              </span>
              <div className="text-center">
                <p className="font-medium">
                  Drop your receipt here, or tap to choose
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, HEIC — up to 8 MB
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onChange}
              />
            </label>
          ) : (
            <div className="space-y-5">
              <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[3/4] sm:aspect-[4/3] max-h-[480px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Receipt preview"
                  className="w-full h-full object-contain bg-black/5 dark:bg-black/40"
                />
                <button
                  type="button"
                  onClick={clear}
                  disabled={busy}
                  className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center transition-colors disabled:opacity-40"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground flex-1 truncate">
                  {file?.name}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  <Upload className="h-4 w-4" />
                  Replace
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onChange}
                />
              </div>

              <Button
                variant="accent"
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={extract}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading the receipt...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Extract items
                  </>
                )}
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 text-sm text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center mt-6">
        Your receipt is sent to our server only to extract the items. Nothing
        is stored.
      </p>
    </motion.div>
  );
}
