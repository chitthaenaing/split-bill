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
        "h-9 w-9 shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-border/60",
        className
      )}
    />
  );
}
