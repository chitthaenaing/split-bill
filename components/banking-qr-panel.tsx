"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, QrCode, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  downloadImageFile,
  prefersShareToPhotoLibrary,
} from "@/lib/download-file";
import { useBillStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  getUserPaymentQrClient,
  paymentQrUrlToDataUrl,
  removePaymentQrFromAccount,
  savePaymentQrToAccount,
  userProfileErrorMessage,
} from "@/lib/user-profile-client";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

type Props = {
  /**
   * `bill` — home flow; syncs into the share store and (when signed in) account.
   * `account` — My bills settings; account is the source of truth.
   */
  variant?: "bill" | "account";
};

export function BankingQrPanel({ variant = "bill" }: Props) {
  const { user, loading: authLoading } = useAuth();
  const bankingQrDataUrl = useBillStore((s) => s.bankingQrDataUrl);
  const setBankingQrDataUrl = useBillStore((s) => s.setBankingQrDataUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [accountUrl, setAccountUrl] = useState<string | null>(null);
  const hydrateAttemptedFor = useRef<string | null>(null);

  useEffect(() => {
    setSaveToLibrary(prefersShareToPhotoLibrary());
  }, []);

  // Load saved account QR into the bill store (once per signed-in user).
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAccountUrl(null);
      hydrateAttemptedFor.current = null;
      return;
    }
    if (hydrateAttemptedFor.current === user.uid) return;
    hydrateAttemptedFor.current = user.uid;

    let cancelled = false;
    setHydrating(true);
    (async () => {
      try {
        const profile = await getUserPaymentQrClient(user.uid);
        if (cancelled) return;
        if (!profile) {
          setAccountUrl(null);
          return;
        }
        setAccountUrl(profile.paymentQrUrl);
        if (!useBillStore.getState().bankingQrDataUrl) {
          const dataUrl = await paymentQrUrlToDataUrl(profile.paymentQrUrl);
          if (!cancelled) setBankingQrDataUrl(dataUrl);
        }
      } catch {
        // best-effort — local/session QR still works
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, setBankingQrDataUrl]);

  const previewSrc = bankingQrDataUrl || accountUrl;

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setBusy(true);
      try {
        const dataUrl = await fileToDataUrl(f);
        setBankingQrDataUrl(dataUrl);
        if (user) {
          const saved = await savePaymentQrToAccount({
            uid: user.uid,
            dataUrl,
          });
          setAccountUrl(saved.paymentQrUrl);
        }
      } catch (err) {
        setError(userProfileErrorMessage(err));
      } finally {
        setBusy(false);
        e.target.value = "";
      }
    },
    [setBankingQrDataUrl, user]
  );

  const clear = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (user && (accountUrl || bankingQrDataUrl)) {
        await removePaymentQrFromAccount(user.uid);
        setAccountUrl(null);
      }
      setBankingQrDataUrl(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(userProfileErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [accountUrl, bankingQrDataUrl, setBankingQrDataUrl, user]);

  const description =
    variant === "account"
      ? "Save your PromptPay or bank QR once. It’s reused automatically whenever you share a bill while signed in."
      : user
        ? "Add a photo of your PromptPay or bank QR. Signed in — this is saved to your account and bundled into share links."
        : "Add a photo of your PromptPay or bank QR. It is bundled into the share link so people paying you can scan it. Sign in to save it for next time.";

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-border/70 flex items-center gap-2 text-sm font-medium">
        <QrCode className="h-4 w-4 text-muted-foreground" />
        Payment QR
        {user && accountUrl ? (
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">
            Saved to account
          </span>
        ) : null}
      </div>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>

        {hydrating && !previewSrc ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved QR…
          </div>
        ) : !previewSrc ? (
          <label
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 cursor-pointer transition-colors",
              "hover:border-accent/40 hover:bg-accent/[0.04]",
              busy && "pointer-events-none opacity-60"
            )}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {busy ? "Saving…" : "Tap to add QR image"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              JPG, PNG — up to 8 MB
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={onPick}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-muted border border-border max-h-48 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
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
                disabled={busy}
                onClick={() =>
                  void downloadImageFile({
                    src: previewSrc,
                    baseName: "payment-qr",
                  })
                }
                aria-label={
                  saveToLibrary
                    ? "Save payment QR to photo library"
                    : "Download payment QR"
                }
              >
                <Download className="h-4 w-4" />
                {saveToLibrary ? "Save" : "Download"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Replace
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busy}
                onClick={() => void clear()}
                aria-label="Remove QR image"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
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
