import Link from "next/link";
import { FileQuestion, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center shadow-sm shadow-accent/30">
              <Wallet className="h-5 w-5" />
            </span>
            <span className="font-semibold tracking-tight text-base sm:text-lg">
              Bill Split
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-md px-4 sm:px-6 py-16 sm:py-24">
        <Card className="text-center">
          <CardContent className="p-8 sm:p-10 space-y-4">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
              <FileQuestion className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Bill not found
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                This link is invalid or the bill has been removed.
              </p>
            </div>
            <Link
              href="/"
              className={buttonVariants({ variant: "accent", size: "md" })}
            >
              Start a new bill
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
