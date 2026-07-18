"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function AppLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={36}
      height={36}
      priority
      className={cn(
        "h-8 w-8 shrink-0 rounded-xl object-cover ring-1 ring-border/70",
        className
      )}
    />
  );
}
